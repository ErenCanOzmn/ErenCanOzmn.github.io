---
title: "Thick Client Güvenliği: Diskte Şifreli, Bellekte Açık"
date: 2026-09-27 17:00:00 +0300
categories: [Thick Client Security]
tags: [windows, thick-client, memory, dpapi, dotnet, pentest, hardening]
lang: tr
description: "SQL ve PFX parolalarını yalnızca kullanım anında çözmek neden yeterli değil? Çalışma zamanı gözlemleri, karşılaştırmalı C# örnekleri ve ortak sırları istemciden kaldıran mimari."
---

Bir masaüstü uygulamasının ayar dosyasında SQL parolasını açık olarak görmemek iyi bir başlangıç. Fakat uygulama o parola ile veritabanına bağlanabiliyorsa, bağlantıyı kurduğu anda kullanabileceği bir değer elde ediyor demektir. Parolanın dosyada şifreli durması, bu aşamayı ortadan kaldırmıyor.

Geliştirici tarafında sık karşılaşılan bir cevap var: “Parolayı sadece gerektiğinde çözüyoruz, işlem bitince de siliyoruz.” Bu yaklaşım bellekte gereksiz veri bırakmayı azaltır. Buna rağmen, çözme işlemini gerçekleştiği anda gözlemleyebilen biri için yeterli bir koruma değildir.

Bu yazıda aynı veriyi üç farklı tasarımla ele alacağız. İlk uygulama çözdüğü veriyi bellekte tutacak. İkincisi yalnızca işlem sırasında açıp kendi tamponunu temizleyecek. Üçüncü uygulamaya ise ortak SQL ve PFX parolası hiç verilmeyecek. Böylece bellek temizliği ile mimari çözüm arasındaki farkı, çalışan örnekler üzerinden konuşabileceğiz.

Laboratuvardaki bütün değerler sahtedir. SQL sunucusuna bağlanılmaz, PFX dosyası içe aktarılmaz ve gerçek bir sertifikayla imza atılmaz. Parola biçimindeki örnek veriler her hazırlamada yeniden üretilir.

## Veriyi saklamak ve kullanmak

Hassas veriyi incelerken üç ayrı durumla karşılaşırız: diskte saklanan veri, ağ üzerinden taşınan veri ve uygulamanın işlediği veri. Bu durumların korumaları birbirinin yerine geçmez.

![Şifreli dosyanın çözülmesi, bellekte kullanılması ve tamponun temizlenmesi sırasında çalışma zamanı gözlemi](/assets/images/thic-client-secret/01-verinin-yasam-dongusu.png)
_Şekil 1: Uygulama veriyi kullanmak için çözer. Kullanım anında alınan bir kayıt, uygulama kendi tamponunu temizledikten sonra da kalabilir._

Örneğin DPAPI ile korunan bir dosya, uygun Windows bağlamı olmadan doğrudan okunmaya karşı koruma sağlar. HTTPS, istemci ile sunucu arasındaki trafiği korur. Uygulamanın kullanmak üzere çözdüğü parola ise bu korumaların başka bir aşamasındadır.

Windows DPAPI'nin kullanıcı kapsamı normalde veriyi ilgili Windows kimliğine bağlar. Makine kapsamı seçildiğinde kullanıcılar arasında aynı ayrım sağlanmaz. Dosyanın izinleri ve varsa ek entropy de değerlendirmeye dahildir. Bu kapsamların ayrıntıları [CryptProtectData belgesinde](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata) açıklanır.

Buradan “DPAPI işe yaramıyor” sonucu çıkmaz. DPAPI'nin koruduğu şeyle, uygulama çalışırken beklediğimiz korumayı ayırmamız gerekir. Kullanıcı kapsamında şifrelenen bir verinin aynı kullanıcı bağlamında uygulama tarafından çözülebilmesi normaldir.

Sorun, son kullanıcının bilgisayarında kullanılan bir sırrın o kullanıcıdan mutlaka gizli kalacağı varsayımıyla tasarım yapıldığında ortaya çıkar. Bütün kurulumlarda ortak kullanılan, geniş yetkili bir SQL hesabı buna iyi bir örnektir.

## Çalışma zamanında ne gözlemledik?

İncelemede iki farklı durumu ele aldık: bellekte kalan metinleri aramak ve çözme çağrısının dönüşünde ortaya çıkan veriyi gözlemlemek. İlki tarama anında erişilebilen alanları gösterir. İkincisi, verinin kullanıma açıldığı ana bakar.

Örneğimizde `CryptUnprotectData` çağrısının dönüşünü izledik. Uygulama saklanan veriyi çözdüğünde, SQL ve PFX parolası biçimindeki sahte değerlerin açık hâlini görebildik. Gözlemlediğimiz nokta, uygulamanın bu veriyi kullanmak üzere aldığı aşamaydı.

Bu, şifreleme algoritmasının kırılması anlamına gelmiyor. Uygulama kendi yetkisiyle veriyi çözüyor. Gözlem o noktada gerçekleşiyor. Aynı şekilde TLS öncesindeki açık veriyi süreç içinde görmek, ağ üzerinde TLS'nin aşıldığını göstermez.

Bu incelemede kullanılan bellek taramasının kapsamı sınırlıydı. Tarama kodu her bellek bölgesinin ilk 2 MB'ında, altı veya daha uzun yazdırılabilir ASCII dizilerini arıyordu. UTF-16 metinler, farklı veri biçimleri ve taranmayan alanlar gözden kaçabilir. Bu nedenle bir taramada parola bulunamaması, parolanın süreçte hiç bulunmadığına dair yeterli kanıt değildir.

Yakalanan veri ile uygulamanın o anki belleğini de ayırmak gerekir. Çözme sırasında aldığımız kayıt, gözlem anındaki verinin ayrı bir kopyasıdır. Uygulama daha sonra tamponunu temizlese bile bu kayıt kalabilir. Kayıt, verinin o anda görülebildiğini gösterir. Hedef süreçte hâlâ bulunduğunu tek başına göstermez.

## Laboratuvarın düzeni

Örnekler C# ile hazırlanmış dört masaüstü uygulamasından oluşuyor. İlk iki uygulama aynı sahte veri biçimini kullanıyor. Üçüncü ve dördüncü uygulama birlikte çalışıyor.

| Uygulama | Gösterdiği davranış |
|---|---|
| `01_ResidentSecrets.exe` | Veriyi çözer, açık tamponu bir alanda tutar ve çıkış işleminde temizlemez. |
| `02_TransientSecrets.exe` | Veriyi işlem sırasında çözer, kendi tamponunu `finally` içinde temizler. |
| `03_ApiClient.exe` | Kullanıcı oturumuyla bir işlem ister. SQL veya PFX parolası almaz. |
| `04_LabService.exe` | Örnek işlemi kendi sürecinde yapar, istemciye yalnızca sonucu döndürür. |

Veri içindeki `LAB_SQL_` ve `LAB_PFX_` önekleri ekran görüntüsünde örneği tanımayı kolaylaştırır. Bunları izleyen değerler çalışma sırasında rastgele üretilir. Tam parola kaynak kodda sabit olarak bulunmaz.

İlk iki uygulamanın “Demo verisini hazırla” düğmesi veriyi üretir ve DPAPI ile dosyaya yazar. Bu hazırlama işlemi de bir şifreleme olayı oluşturabilir. Kullanım anını karşılaştırırken hazırlama ile çözme olayını birbirine karıştırmamak gerekir.

## İlk örnek: Çözülen veriyi bellekte bırakmak

İlk uygulama dosyayı açtıktan sonra dönen bayt dizisini statik bir alanda saklar. Örnek işlemi bu diziyle yapar ve referansı korur. “Oturumu kapat” düğmesi bu alanı temizlemez.

Aldığımız kayıtta şifreleme ve çözme aşamalarını ayrı satırlarda gördük. `CryptProtectData` hazırlama işlemine, `CryptUnprotectData` ise saklanan verinin çözülmesine ait. Çözme çağrısında lab için üretilmiş `LAB_SQL_` ve `LAB_PFX_` değerlerini açık olarak görebildik.

![Şifreleme ve çözme çağrılarında gözlemlediğimiz sahte SQL ve PFX parolaları](/assets/images/thic-client-secret/02-resident-captured.png)
_Şekil 2: Örnek verinin açık hâli kriptografi çağrısında gözlemleniyor. Bu kayıt tek başına verinin ne kadar süre bellekte kaldığını göstermez._

Bu davranışı oluşturan kodda `retained` alanına açık veri atanıyor. Ekran görüntüsünde 24 ile 32. Satırlar arasında işlem ve çıkış düğmelerinin işleyicileri var. Çıkış işleyicisi yalnızca mesaj yazıyor. `retained` alanına dokunmuyor. Daha aşağıdaki ayrı temizleme düğmesi ise ancak kullanıcı o düğmeye basarsa çalışıyor.

![Resident.cs dosyasında açık veriyi statik alanda tutan işlem ve tamponu temizlemeyen çıkış işleyicisi](/assets/images/thic-client-secret/03-resident-kod.png)
_Şekil 3: `retained = vault.Open()` açık veriyi saklıyor. Arayüzden çıkış yapmak bu alanı temizlemiyor._

<details markdown="1">
<summary>İlgili kodu metin olarak göster</summary>

```csharp
private static byte[] retained;

// İşlem düğmesindeki kod:
retained = vault.Open();
SecretVault.SimulateUse(retained);
```

</details>

Buradaki `vault.Open()` DPAPI ile dosyayı çözer. `SimulateUse()` yalnızca sahte verinin baytlarını işleyen bir laboratuvar fonksiyonudur. Gerçek bağlantı açmaz.

Bellek taramasında da veri bulunabilir. Ancak taramanın kapsamı nedeniyle bunun her çalıştırmada görünmesini garanti edemeyiz. Burada kullanım anındaki görünürlüğü çağrı kaydından, tamponun tutulmasını ise kaynak koddan ayırarak değerlendiriyoruz.

Bu davranışın iyileştirilmesi gerekir. Gereksiz referansları kaldırmak ve sahip olunan tamponları temizlemek, verinin daha sonra bir bellek dökümünde veya hata incelemesinde görünme ihtimalini azaltabilir. Fakat sır uygulamanın kullanımına verilmeye devam ettiği sürece ikinci örnekteki sorun kalır.

## İkinci örnek: “Anlık çözüp siliyoruz”

İkinci uygulama açık veriyi uzun süre saklamaz. İşlem tamamlandığında, hata oluşsa bile sahip olduğu bayt dizisini temizler. Buna rağmen çözme çağrısındaki açık veri gözlemlenebilir.

![CryptUnprotectData çağrısının dönüşünde gözlemlediğimiz örnek verinin açık hâli](/assets/images/thic-client-secret/04-transient-captured.png)
_Şekil 4: İkinci yakalamada da SQL ve PFX biçimindeki sahte değerler çözme olayında görülebiliyor. Önceden alınan kayıt, hedefte sonradan yapılan temizlikten etkilenmiyor._

İlgili kaynak kodda `Open()` veriyi çözüyor, `UseBriefly()` ise dönen diziyi yalnızca işlem boyunca kullanıyor. `finally` içindeki `Array.Clear`, uygulamanın sahip olduğu diziyi temizliyor. Açık verinin ortaya çıktığı çağrı bu temizlemeden önce gerçekleşiyor.

![SecretVault.cs içinde DPAPI ile veriyi açan Open metodu ve finally içinde tamponu temizleyen UseBriefly metodu](/assets/images/thic-client-secret/05-transient-kod.png)
_Şekil 5: `ProtectedData.Unprotect` veriyi açıyor. `Array.Clear` daha sonra bu diziyi temizliyor. Kullanım anındaki gözlemi geri almıyor._

<details markdown="1">
<summary>İlgili kodu metin olarak göster</summary>

```csharp
byte[] plain = vault.Open();
try
{
    SecretVault.SimulateUse(plain);
}
finally
{
    Array.Clear(plain, 0, plain.Length);
}
```

</details>

Bu sürüm ilkinden daha iyi bellek hijyeni uygular. Kodda özellikle bekleme yoktur. Sahte parola arayüze veya uygulama loguna yazılmaz, `string`e dönüştürülmez.

Yine de çözme çağrısı gerçekleşir. Bu çağrıyı işlem başlamadan izlemeye aldığımızda, tampon temizlenmeden önceki veriyi görebildik. Hızlı bir bellek taramasıyla doğru ana denk gelmeye çalışmakla, çağrının dönüşünü gözlemlemek aynı yöntem değildir.

Bu davranışı, aynı `SecretVault` kodunu kullanan ayrı bir test sürecinde de doğruladık. Testte 194 baytlık örnek verinin `CryptUnprotectData` çağrısındaki açık hâlini kaydettik. SQL ve PFX işaretlerini gördük. İşlem döndüğünde uygulamanın sahip olduğu dizinin bütün baytlarının sıfır olduğunu da kontrol ettik. Ham parola değerlerini doğrulama raporuna eklemedik.

Bu ölçüm bütün bellek kopyalarının temizlendiğini iddia etmiyor. Doğruladığı şey daha dar: uygulamanın kendi tamponu temizlense bile çözme anındaki gözlem gerçekleşmişti.

Bu yüzden “işlemden sonra sildik” cevabı, “ortak veritabanı parolasını son kullanıcıdan gizleyebiliyor muyuz?” sorusunu çözmez. Parolanın bellekte kalma süresi kısalmıştır. İstemciye verilmesi değişmemiştir.

## SQL parolası neden daha farklı bir risk?

Kullanıcının zaten görmeye yetkili olduğu bir ekran metniyle, bütün müşterilere erişebilen ortak veritabanı parolası aynı şekilde değerlendirilemez. İkinci durumda uygulamanın kendi ekranlarında koyduğu sınırların altında, daha geniş bir yetki bulunabilir.

Pentest değerlendirmesinde hesabın neye eriştiği, yetkilerinin kapsamı, veritabanına hangi ağlardan ulaşılabildiği ve hesabın kurulumlar arasında paylaşılıp paylaşılmadığı belirleyicidir. SQL biçiminde görünen her metin canlı bir hesap değildir. Sadece parola görüntüsünden bütün veritabanına erişim veya tam yetki sonucu çıkarılmaz.

Mimari izin veriyorsa ortak SQL hesabı masaüstü uygulamasından kaldırılmalıdır. Kullanıcı bir API'ye kendi kimliğiyle bağlanır. API her işlemde kullanıcının rolünü, ilgili kaydın sahibini ve kurum sınırını denetler. Veritabanı bağlantısı bu kontrollerin arkasında kurulur. Kullanıcıya SQL parolası gönderen bir API, sorunu yalnızca başka bir adıma taşır.

Microsoft'un [public client açıklaması](https://learn.microsoft.com/en-us/entra/identity-platform/msal-client-applications), masaüstüne dağıtılan uygulamaların uygulama sırlarını güvenilir biçimde saklayacağı varsayımına neden dayanılmaması gerektiğini anlatır.

Doğrudan veritabanı bağlantısının zorunlu olduğu eski sistemlerde ise kullanıcıya özgü Windows veya veritabanı kimliği, dar yetkiler ve veritabanı tarafında uygulanan erişim kuralları değerlendirilebilir. Kullanıcının kendi yetkisiyle sorgu çalıştırması tasarımın parçasıysa bunu yalnızca EXE içinde kontrol etmeye çalışmamak gerekir. Ortak ve geniş yetkili hesabı şifrelemek, bu yetki ayrımını oluşturmaz.

## Üçüncü örnek: İstemciye sırrı vermemek

Üçüncü uygulamanın kaynak koduna sır üreten veya çözen sınıf dahil edilmez. Buradaki değişiklik, parolanın istemciye verilmesini kaldırmaktır. Üretimde bu ayrım, kullanıcının denetimi dışındaki bir servis üzerinden kurulabilir.

![Masaüstü istemcisinin güven sınırının ötesindeki API'den işlem sonucu aldığı ve ortak sırların sunucu tarafında kaldığı mimari](/assets/images/thic-client-secret/06-sir-istemcide-yok-v2.png)
_Şekil 6: Üretim mimarisinde istemci yalnızca işlem ister. API yetkiyi denetler. Veritabanı erişimi veya imza işlemi sunucu tarafında yapılır._

Lab istemcisi bir oturum alır ve kendi raporunu ister. Kodda SQL veya PFX parolasını almak için bir çağrı yoktur. Rapor isteği kullanıcı oturumuyla gönderilir.

![Client.cs dosyasında kullanıcı oturumuyla rapor isteyen ve ortak servis parolası almayan istemci kodu](/assets/images/thic-client-secret/07-istemci-kod.png)
_Şekil 7: İstemci `Protocol.Request` ile rapor istiyor. SQL veya PFX parolası çözmüyor._

<details markdown="1">
<summary>İstemcideki rapor isteğini metin olarak göster</summary>

```csharp
string response = Protocol.Request(
    "REPORT", sessionToken, "REPORT-MINE");
```

</details>

Servis doğrulanmış Windows kimliğini, oturumu, işlem adını ve istenen örnek kaydı denetler. Bu kontrollerden sonra kendi sürecindeki örnek işi yapar. Yanıtta yalnızca sabit örnek rapor bulunur. Parolayı döndüren bir işlem tanımlanmamıştır.

![Service.cs dosyasında oturum süresi, kimlik, işlem ve kayıt kontrolünden sonra yalnızca rapor döndüren servis kodu](/assets/images/thic-client-secret/08-servis-kod.png)
_Şekil 8: Kontroller servis tarafında uygulanıyor. Örnek sır yalnızca servis işleminde kullanılıyor ve rapor yanıtına eklenmiyor._

Labda “Diğer raporu iste” düğmesi de bulunur. Bu isteğin servis tarafından reddedilmesi, arayüzde bir düğmenin gizlenmesinden farklıdır. Çıkış işleminde oturum servis tarafında kaldırılır. Eski tokenla yapılan bir sonraki istek de reddedilir. Oturumların ayrıca iki dakikalık ömrü vardır.

Bu labda kolay çalıştırılabilmesi için servis aynı bilgisayarda ayrı bir süreç olarak açılır ve iletişim named pipe üzerinden yapılır. Bu düzen, istemciye neyin gönderildiğini göstermek içindir. Aynı kullanıcıyla çalışan yerel servis, makinenin yöneticisine veya aynı hesaptaki bütün süreçlere karşı uzak sunucu sınırı oluşturmaz. Lab protokolü de üretime taşınacak hazır bir API değildir.

Gerçek çözümde servis kullanıcının denetimi dışındaki bir ortamda çalışır. Kullanıcı kimlik doğrulaması, güvenilir sunucu bağlantısı ve her istekte yetkilendirme gerekir. Masaüstü uygulamalarında uygun OAuth tasarımı için sistem tarayıcısı ve PKCE kullanan akışlar [RFC 8252'de](https://www.rfc-editor.org/rfc/rfc8252.html) açıklanır. PKCE, ele geçirilmiş bir masaüstü sürecini güvenilir hâle getirmez ve bütün token erişimini engellemez.

İstemcide artık hiç hassas veri olmadığı da söylenemez. Kullanıcı oturumu ve erişebildiği rapor yine oradadır. Kazanım, son kullanıcı sürecinin ortak SQL veya PFX parolasını bilmemesidir. Kullanıcı oturumunun kapsamı, süresi ve iptali ayrıca yönetilir. JWT kullanan gerçek sistemlerde arayüzden çıkış yapmak veya refresh tokenı kaldırmak, verilmiş bütün access tokenları kendiliğinden anında geçersiz kılmaz. API'nin bunu nasıl uyguladığı ayrıca tasarlanmalıdır.

## Sertifika parolası için ne değişiyor?

“Sertifika parolası” derken hangi değerden bahsettiğimizi belirtmek gerekir. Sertifikanın herkese açık kısmı bir sır değildir. PFX dosyasının parolası, paketteki özel anahtar ve o anahtarla işlem yapma yetkisi farklı şeylerdir.

Uygulama her açılışta bir PFX dosyasını parola ile içe aktarıyorsa, parolanın kullanılabildiği bir aşama vardır. PFX parolasını şifreli ayar dosyasına taşımak veya yalnızca içe aktarma sırasında çözmek bu aşamayı kaldırmaz. Labdaki PFX alanı yalnızca bu veri yaşam döngüsünü temsil eder. Gerçek PFX içe aktarma testi değildir.

Ortak bir kurumsal imza anahtarı söz konusuysa anahtarı istemcilere dağıtmak yerine sunucuda veya HSM'de tutmak değerlendirilebilir. Sunucu yalnızca izin verilen belge ve işlem türleri için imza üretmeli, talep eden kişinin yetkisini denetlemelidir. Her gelen veriyi imzalayan genel bir uç nokta, anahtar dışarı çıkmasa da yanlış işlemlere imza atabilir.

İşlemin cihazda yapılması gerekiyorsa cihaza veya kullanıcıya özgü, mümkünse TPM içinde üretilen ve dışarı aktarılamayan bir anahtar tercih edilebilir. Böyle bir tasarımda uygulama PFX parolası taşıyarak anahtarı açmak yerine sağlayıcıya anahtarı kullanma isteği gönderir. TPM'nin taşınamaz anahtarlarının özel kısmının donanım dışında açığa çıkmaması [Microsoft'un TPM belgesinde](https://learn.microsoft.com/en-us/windows/security/hardware-security/tpm/tpm-fundamentals) açıklanır.

Ancak anahtarın dışarı çıkarılamaması, kötüye kullanılamayacağı anlamına gelmez. Anahtarı kullanmaya yetkili bir sürecin ele geçirilmesi hâlinde yetkili işlemler suistimal edilebilir. Anahtar erişim izinleri, kullanım amacı, kullanıcı onayı gereken işlemler ve sunucu tarafındaki kabul kuralları önemini korur. Yazılımsal bir anahtara sadece “non-exportable” işareti koymayı da TPM'de anahtar üretmekle eş tutmamak gerekir.

## Uygulama incelendiğini fark edebilir mi?

Ortak sırrı istemciden kaldırmanın yanında, uygulamanın çalışma sırasında incelendiğine veya değiştirildiğine dair belirtileri değerlendirmek de bir savunma katmanı olabilir. Frida gibi araçların süreç içine eklediği bileşenlere ait izler, beklenmeyen modüller ve kod bütünlüğündeki değişiklikler bu amaçla ele alınabilir. Hedef, hassas bir işlem başlamadan önce şüpheli durumu fark etmektir.

Debugger kontrolü ile Frida tespiti aynı şey değildir. Windows'taki `IsDebuggerPresent`, çağrıyı yapan sürecin bir kullanıcı modu debugger'ı altında çalışıp çalışmadığını bildirir. Sonucun olumsuz olması, süreçte çalışma zamanı incelemesi yapılmadığını kanıtlamaz. Fonksiyonun kapsamı [Microsoft belgesinde](https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-isdebuggerpresent) açıklanır.

Yalnızca bir araç adına bakmak yerine birden fazla belirti birlikte değerlendirilebilir. Yüklenen modüllerin beklenen kaynaklardan gelmesi, kritik kodun bütünlüğü ve debugger durumu bu değerlendirmenin parçalarıdır. Antivirüs, erişilebilirlik veya performans izleme yazılımları da uygulamayla etkileşime girebilir. Beklenmeyen her bileşeni saldırı saymak yanlış alarmlara yol açabilir.

Tespit sonrasında verilecek tepki de tasarlanmalıdır. Riskli işlemi başlatmamak, ek kullanıcı doğrulaması istemek veya hassas veri içermeyen bir güvenlik kaydı oluşturmak düşünülebilir. Kullanıcının kaydedilmemiş verisini kaybettirecek ani kapanışlar yerine işlemle orantılı bir tepki tercih edilmelidir. Sunucu da istemciden gelen “inceleme yok” mesajını tek başına güven kanıtı saymamalıdır.

Bu kontrollerin kendisi de kullanıcının denetimindeki süreçte çalışır. Değiştirilebilir veya devre dışı bırakılabilirler. Tespit, incelemenin maliyetini artırabilir fakat istemcide kullanılan ortak SQL parolasının gizliliğini garanti etmez. OWASP'ın mobil uygulamalar için hazırladığı [MAS-R yaklaşımı](https://mas.owasp.org/Profiles/MAS-R/) da bu korumaları temel güvenlik kontrollerini tamamlayan bir katman olarak ele alır. Aynı ayrımı masaüstü uygulamasında da korumak gerekir.

Bu yazıdaki laboratuvar, verinin kullanım anındaki görünürlüğünü karşılaştırıyor. Frida tespiti ve bütünlük kontrolleri bu örneklere eklenmedi. Bunları ayrı bir yazıda, tespit edilen durum ve verilen tepki üzerinden inceleyeceğiz.

## Hangi önlem hangi sorunu çözüyor?

| Önlem | Sağladığı koruma | Çözmediği nokta |
|---|---|---|
| DPAPI ve doğru dosya izinleri | Saklanan verinin korunması | Uygulamanın çözerek kullandığı anın gözlemlenmesi |
| Kısa bellek ömrü ve tampon temizliği | Gereksiz kalıntıların azaltılması | Kullanım anında alınmış kopya |
| Log ve dump politikasının düzenlenmesi | Hassas verinin ikinci dosyalara yayılmasının azaltılması | Sırrın istemcide kullanılması |
| Frida / debugger belirtileri ve bütünlük kontrolleri | Çalışma zamanı müdahalesini fark etme ve incelemeyi zorlaştırma | İstemcide kullanılan sırrın gizliliğine kesin güvence |
| Ortak SQL hesabını uzak serviste tutmak | Ortak sırrın istemciye dağıtılmasının kaldırılması | API yetkilendirme hataları ve servis güvenliği |
| Kullanıcıya özgü, sınırlı oturum | Bir oturumun etkisinin sınırlandırılması | Geçerli oturumun kendi yetkileriyle kötüye kullanılması |
| TPM veya HSM tabanlı anahtar | Uygun yapılandırmada özel anahtarın dışarı aktarılmasının engellenmesi | Yetkili anahtar kullanımının suistimali |

Bellek temizliği yine yapılmalıdır. Buradaki itiraz, onu bütün sorunun çözümü gibi sunmaya yöneliktir. Özellikle .NET'te bir `string` referansını `null` yapmak, o metnin bütün kopyalarını sıfırlamaz. Sabit bir metni `ToCharArray()` ile diziye çevirip diziyi temizlemek de başlangıçtaki metni ortadan kaldırmaz.

Bu lab .NET Framework ile derlendiği için sahip olunan diziyi `Array.Clear` ile temizliyor. Uygun modern .NET sürümlerinde kriptografik tamponlar için [CryptographicOperations.ZeroMemory](https://learn.microsoft.com/dotnet/api/system.security.cryptography.cryptographicoperations.zeromemory) kullanılabilir. Hangi API seçilirse seçilsin, uygulamanın kontrol etmediği kopyalar ve daha önce gözlemlenen veri ayrıca düşünülmelidir. `SecureString` de genel bir çözüm değildir. Microsoft [yeni geliştirmelerde kullanılmasını önermiyor](https://learn.microsoft.com/en-us/dotnet/api/system.security.securestring?view=net-10.0).

## Pentest bulgusunu nasıl yazmalı?

“Bellekte parola bulundu” bir gözlemdir. İyi bir bulgu bunun hangi güven sınırını etkilediğini açıklar. Ortak servis hesabının son kullanıcıya dağıtılması, çıkıştan sonra gereksiz kalıntı bırakılması ve bitmiş oturumun sunucuda geçerli kalması ayrı sorunlar olabilir.

Raporda verinin türü, uygulamanın hangi işlemi sırasında görüldüğü ve gözlem için gereken başlangıç yetkisi yer almalıdır. Yönetici yetkisiyle alınmış bir gözlemi standart kullanıcının erişimi gibi sunmamak gerekir. Aynı şekilde standart kullanıcının kendi istemcisinden, uygulamada kendisine tanınandan daha geniş bir hizmet yetkisi öğrenmesi de “zaten kendi bilgisayarı” denilerek geçiştirilmemelidir.

Bir SQL hesabında yetki ve ağ kapsamı değerlendirilir. PFX parolası için pakete erişim ve özel anahtarın kullanım amacı önemlidir. Bir token için kullanıcı, kapsam ve geçerlilik süresine bakılır. Bulgunun önem derecesi de görülen metne değil, bu koşulların oluşturduğu etkiye göre belirlenir.

Ekran görüntüsünde tam parola yerine maskeli örnek, işlem adı, zaman ve hedef PID yeterli olabilir. Labdaki değerler sahtir. Gerçek incelemede kaydedilen oturumlar ve dışa aktarılan dosyalar da hassas veri içerebilir. Kanıt toplarken yeni bir sızıntı oluşturulmamalıdır.

Bu laboratuvarda ikinci örneğin tamponu temizlendi, ancak kullanım anı yine gözlemlenebildi. Üçüncü örnekte değişen şey temizliğin hızı değildi: istemciye ortak servis parolası hiç verilmedi. Geliştirme sırasında verilecek temel karar da budur. Bu sırrı gerçekten son kullanıcının bilgisayarında kullanmak zorunda mıyız?

## Sonraki yazı

Bir sonraki yazının konusu **“Uygulama İncelendiğini Fark Edebilir mi? Frida Tespiti ve Çalışma Zamanı Bütünlüğü”** olacak. Debugger kontrolünün neyi gösterdiğini, çalışma zamanı müdahalesine ait belirtileri ve yanlış alarm üretmeden nasıl tepki verilebileceğini ele alacağız.

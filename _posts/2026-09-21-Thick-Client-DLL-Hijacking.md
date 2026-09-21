---
title: "Thick Client Güvenliği: DLL Hijacking"
date: 2026-09-21 22:40:00 +0300
categories: [Thick Client Security]
tags: [windows, dll-hijacking, thick-client, pentest, hardening]
lang: tr
description: "Windows DLL arama sırası nasıl işler? Örnek bir uygulama üzerinden DLL hijacking, yükleme kayıtları ve güvenli DLL yükleme yöntemleri."
---

Bir masaüstü uygulaması çalışırken EXE dosyasının yanında çeşitli kütüphaneleri de kullanır. Bu kütüphanelerden biri beklenmeyen bir konumdan yüklenirse uygulama, geliştiricinin amaçladığından farklı bir kod çalıştırabilir. DLL yüklemelerini incelerken bu yüzden iki soruya bakarız: **Hangi DLL yükleniyor ve bu dosyayı kim değiştirebiliyor?**

Önce uygulama ile DLL arasındaki ilişkiye ve Windows'un DLL arama sırasına bakalım. Ardından örnek bir uygulamanın yükleme kayıtları üzerinden DLL hijacking davranışını inceleyip geliştirici tarafında alınabilecek önlemlere geçelim.

## Uygulama ile DLL Arasındaki İlişki Nasıl Kurulur?

Bir raporlama uygulaması düşünelim. Kullanıcı arayüzü `RaporApp.exe` içinde, rapor biçimlendirme işlevleri ise `RaporMotoru.dll` içinde bulunuyor olsun. Kullanıcı bir rapor istediğinde uygulama kütüphanenin sunduğu fonksiyonları çağırarak sonucu alabilir.

Windows, native DLL'yi uygulamanın sanal adres alanına eşler. Uygulama, DLL'nin dışa aktardığı fonksiyonları çağırır, parametreleri iletir ve dönüş değerlerini kullanır. DLL kodu da onu çağıran sürecin ve iş parçacığının bağlamında çalışır.

Uygulama DLL'ye iki şekilde bağlanabilir. **Yükleme zamanında bağlamada** gerekli bağımlılıklar uygulama açılırken çözülür. **Çalışma zamanında bağlamada** ise uygulama, ihtiyaç duyduğu anda `LoadLibrary` veya `LoadLibraryEx` ile kütüphaneyi yükler ve `GetProcAddress` ile ilgili fonksiyonun adresini alır. Microsoft bu iki yöntemi [DLL çalışma modeli](https://learn.microsoft.com/en-us/windows/win32/dlls/about-dynamic-link-libraries) belgesinde açıklar.

![DLL'nin uygulama sürecine yüklenmesi, fonksiyon çağrısı ve dönüş değeri](/assets/images/thick-client-dll-hijacking/01-uygulama-dll-iliskisi.png)
_Şekil 1: Uygulama, kendi adres alanına yüklenen DLL'nin fonksiyonlarını çağırır._

Burada Windows'un native DLL yükleme davranışını inceliyoruz. .NET assembly çözümlemesi farklı kurallara sahiptir. Bir .NET uygulamasının native bağımlılıkları ise ayrıca değerlendirilmelidir.

## DLL Hijacking Nedir?

DLL hijacking, uygulamanın beklediği kütüphane yerine saldırganın kontrol ettiği aynı adlı bir kütüphaneyi yüklemesidir. Tam yol belirtilmemesi, aramanın gereğinden fazla dizini kapsaması veya DLL'nin bulunduğu konuma standart kullanıcının yazabilmesi bu soruna yol açabilir.

Raporlama uygulaması örneğine dönersek geliştirici, ürünle birlikte dağıttığı `RaporMotoru.dll` dosyasının kullanılmasını bekler. Dosya adının eşleşmesi bunu garanti etmez. Yüklenen dosyanın, uygulamanın güvendiği ve koruduğu konumdan gelmesi gerekir.

Yüklenen DLL, uygulamayla aynı güvenlik bağlamında dosyalara, ağ kaynaklarına ve diğer işletim sistemi nesnelerine erişebilir. Standart kullanıcıyla çalışan bir uygulamada etki, o kullanıcının yetkileriyle kod çalıştırılmasıdır. Uygulama daha yüksek yetkiyle çalışıyor ve düşük yetkili kullanıcı yüklenen DLL'yi değiştirebiliyorsa yerel yetki yükseltme de söz konusu olabilir.

DLL injection ile DLL hijacking sıkça karıştırılır. Injection, başka bir sürece kod yükletmeyi hedefler. Hijacking örneğimizde ise uygulama, kendi yükleme çağrısı sırasında yanlış DLL'yi seçer.

## DLL Search Order: Windows DLL'yi Nerede Arar?

DLL search order, yalnızca modül adı verildiğinde Windows'un DLL'yi bulmak için izlediği sıradır. Şema, dizinlerin sırayla aranmasını basitçe gösteriyor. Ayrıntılarda **Safe DLL Search Mode açıkken standart arama davranışını kullanan paketsiz uygulamaları** esas alıyoruz. Kullanılan yükleme yöntemi ve uygulamanın ayarları bu sırayı değiştirebilir.

![DLL aramasının uygulama, sistem ve diğer dizinler üzerinden basitleştirilmiş gösterimi](/assets/images/thick-client-dll-hijacking/02-dll-search-order.png)
_Şekil 2: DLL aramasının genel mantığı. Arama sırasının ayrıntıları aşağıda._

Yükleyici, dizinlerde aramaya geçmeden önce DLL redirection, API sets, Side-by-side (SxS) manifest yönlendirmesi, önceden yüklenmiş modüller ve KnownDLLs gibi mekanizmaları kontrol eder. Windows 11 sürüm 21H2 ve sonrasında paket bağımlılık grafiği de bu sırada yer alır.

Ardından uygulamanın dizini, sistem dizini, 16 bit sistem dizini, Windows dizini, geçerli çalışma dizini ve `PATH` dizinleri değerlendirilir. **Uygulamanın dizini** EXE dosyasının bulunduğu konumdur. **Geçerli çalışma dizini** ise sürecin o anda kullandığı çalışma konumudur. Bu iki yol aynı olmak zorunda değildir.

Safe DLL Search Mode çalışma dizinini sırada geriye taşır ancak tamamen kaldırmaz. Paketli uygulamalar, manifestler, `SetDllDirectory`, `AddDllDirectory` ve `LOAD_LIBRARY_SEARCH_*` bayrakları davranışı değiştirebilir. Ana DLL'nin tam yolla yüklenmesi de bağımlı DLL'lerin otomatik olarak aynı güvenceyle çözüleceği anlamına gelmez. Güncel ayrıntılar Microsoft'un [DLL arama sırası](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order) belgesinde bulunabilir.

Arama sırasını bilmek, yükleme kayıtlarını yorumlamayı kolaylaştırır. İncelemede yine de DLL'nin hangi yoldan yüklendiğine bakarız. Geliştirici tarafında ise uygulamanın kod yükleyebileceği konumları sınırlamak gerekir.

## DLL Yükleme Ne Zaman Güvensiz Hâle Gelir?

Yalnızca DLL adının kullanıldığı bir çağrıya bakarak zafiyet kararı veremeyiz. Aranan konumların izinlerini ve uygulamanın hangi dosyayı yüklediğini de incelemek gerekir.

| Koşul | İncelenecek soru | Olası sonuç |
|---|---|---|
| DLL tam yol olmadan isteniyor | Yükleyici hangi konumları değerlendiriyor? | Aynı adlı farklı dosya seçilebilir |
| Aranan konumlardan biri yazılabilir | Standart kullanıcı DLL ekleyebilir veya değiştirebilir mi? | Dosyanın kaynağı saldırgan kontrolüne geçebilir |
| Uygulama ilgili DLL'yi gerçekten yüklüyor | Başarılı yükleme hangi tam yoldan gerçekleşti? | Kontrol edilen dosya süreç içine alınabilir |
| DLL kodu süreç içinde çalışıyor | Kodun çalıştığını gösteren bir çıktı var mı? | Uygulamanın yetkileriyle kod çalıştırılması |
| Uygulama daha yüksek yetkiye sahip | Başlangıç ve sonuç kimlikleri gerçekten farklı mı? | Koşullar uygunsa yerel yetki yükseltme |

`NAME NOT FOUND` kaydı, o dosya erişiminin başarısız olduğunu gösterir. Uygulama daha sonra başka bir konumdan beklenen DLL'yi yüklemiş olabilir. Yazılabilir bir klasör bulduğumuzda da uygulamanın o konumdaki dosyayı seçip seçmediğini ve kodun çalışıp çalışmadığını kontrol ederiz.

## Güvenli Bir DLL Yükleme Örneği

Önce `DllLoadingDemo.exe` üzerinden güvenli bir yükleme örneğine bakalım. Uygulama, Windows sistem dizinindeki `dbghelp.dll` dosyasını tam yol ve `LOAD_LIBRARY_SEARCH_SYSTEM32` seçeneğiyle yükledi.

SafiyeMonitor kaydında çağrının başarılı olduğu ve DLL'nin `C:\Windows\System32\dbghelp.dll` yolundan geldiği görüldü.

![SafiyeMonitor üzerinde System32 dizininden yüklenen dbghelp.dll](/assets/images/thick-client-dll-hijacking/03-safiye-guvenli-dll-yukleme.png)
_Şekil 3: SafiyeMonitor kaydında DLL adı, kullanılan API, işlem sonucu ve tam yükleme yolu görülüyor._

Dosyanın sistem dizinindeki konumu Windows Gezgini'nde de görülebiliyor.

![Windows System32 dizinindeki dbghelp.dll dosyası](/assets/images/thick-client-dll-hijacking/04-system32-dbghelp-dll.png)
_Şekil 4: Yükleme kaydındaki dbghelp.dll dosyasının System32 içindeki konumu._

Bu örnekte kayıt ile dosyanın konumu örtüşüyor. Uygulama, beklenen DLL'yi sistem dizininden yüklüyor.

## Laboratuvarda DLL Hijacking

Yükleme davranışını görmek için `VulnerableLoader.exe` ve `ReportPlugin.dll` dosyalarından oluşan bir laboratuvar kullandık.

- `VulnerableLoader.exe`, DLL'yi yalnızca `ReportPlugin.dll` adıyla yükledi.
- `ReportPlugin.dll`, bir PowerShell penceresi açıp `whoami` komutunu çalıştırdı.
- EXE ve DLL, standart kullanıcının yazabildiği aynı geçici laboratuvar klasöründeydi.
- Uygulama standart kullanıcı yetkileriyle çalıştırıldı.

Bu örnekte DLL kodu, uygulamayı başlatan standart kullanıcının yetkileriyle çalıştı.

### Zafiyetli çağrı

Örnekteki yükleme çağrısı şöyle:

```text
LoadLibraryW("ReportPlugin.dll")
```

Çağrı yalnızca dosya adını verir. Yükleyici dosyanın kaynağını süreç için geçerli arama kurallarına göre belirler. Laboratuvarda EXE'nin bulunduğu yazılabilir klasöre aynı adlı DLL yerleştirildiğinde uygulama bu dosyayı seçti.

![Tam yol belirtmeden ReportPlugin DLL dosyasını yükleyen zafiyetli çağrı](/assets/images/thick-client-dll-hijacking/05-zafiyetli-loadlibrary-cagrisi.png)
_Şekil 5: LoadLibraryW çağrısında DLL'nin tam yolu belirtilmemiş._

### Örnek DLL'nin içeriği

DLL'nin dışa aktardığı `RunLab` fonksiyonu, yeni bir PowerShell penceresi açtı. Bu pencerede profil yüklemesi kapalıydı ve yalnızca `whoami` komutu çalıştı.

![Örnek ReportPlugin DLL'sinin kaynak kodu](/assets/images/thick-client-dll-hijacking/06-payload-kaynak-kodu.png)
_Şekil 6: PowerShell penceresinde whoami komutunu çalıştıran örnek DLL._

### Yüklenen DLL'nin doğrulanması

SafiyeMonitor kaydında `LoadLibraryW` çağrısının başarılı olduğu görüldü. Kayıt, `ReportPlugin.dll` dosyasının sürece yüklendiğini gösteriyor.

![SafiyeMonitor üzerinde ReportPlugin DLL yükleme kaydı](/assets/images/thick-client-dll-hijacking/07-safiye-reportplugin-yukleme.png)
_Şekil 7: ReportPlugin.dll için başarılı yükleme kaydı._

### Kodun çalıştığını görmek

DLL içindeki fonksiyon çağrıldığında PowerShell penceresi açıldı ve `whoami` çıktısı alındı. Çıktıdaki kullanıcı, uygulamayı başlatan standart kullanıcıyla aynıydı.

![Standart kullanıcı bağlamında açılan PowerShell ve whoami çıktısı](/assets/images/thick-client-dll-hijacking/08-whoami-kod-calistirma.png)
_Şekil 8: DLL'nin açtığı PowerShell penceresinde kullanıcı kimliği._

Bu sonuç, DLL kodunun çalıştığını gösteriyor. Uygulama standart kullanıcı yetkileriyle çalıştığı için bu testte yetki yükseltme gerçekleşmedi.

### Kayıtlar bize ne söylüyor?

| Gözlem | Kanıtladığı | Tek başına kanıtlamadığı |
|---|---|---|
| DLL adı çağrıda görülüyor | Uygulama bu modülü çözmeye çalışıyor | Dosyanın yüklendiği |
| Yazılabilir klasör bulundu | Standart kullanıcı buraya dosya koyabiliyor | Uygulamanın dosyayı seçeceği |
| Başarılı yükleme kaydı alındı | Belirli DLL süreç içine yüklendi | Fonksiyonun çalıştırıldığı |
| `whoami` çıktısı alındı | DLL içeriği uygulama bağlamında çalıştı | Yetki yükseltme gerçekleştiği |
| Başlangıç ve sonuç kimliği farklı | Bir güven sınırı aşılmış olabilir | Farkın DLL yüklemesinden kaynaklandığı |

Raporda yükleme kaydını, kodun çalıştığını gösteren çıktıyı ve varsa yetki değişimini ayrı ayrı açıklamak gerekir.

## Güvenlik İncelemesinde Nelere Bakılır?

### Test ortamı ve uygulamanın yetkileri

Uygulamanın sürümünü, EXE yolunu, kullanıcı kimliğini, bütünlük düzeyini (integrity level), süreç mimarisini ve test edilen işlevi kaydetmek gerekir. Analiz aracının yönetici olarak çalışması, incelenen uygulamanın da aynı yetkiye sahip olduğu anlamına gelmez.

### DLL yükleme kayıtları

[Process Monitor](https://learn.microsoft.com/en-us/sysinternals/downloads/procmon) veya eşdeğer bir çalışma zamanı gözlem aracıyla hedef sürecin DLL hareketleri izlenebilir. `CreateFile` dosya erişim girişimini, başarılı `Load Image` ise modülün süreç içine eşlendiğini gösterir.

Yalnızca hata satırlarına bakmak yanıltıcı olabilir. Aynı DLL adına ait sonraki başarılı yüklemeler ve tam dosya yolları da incelenmelidir. Süreç, DLL'yi kısa süreliğine yükleyip kaldırıyorsa anlık modül listesi bunu kaçırabilir. Olayları zaman sırasıyla tutan kayıtlar bu durumda daha kullanışlıdır.

### Dosya ve dizin izinleri

DLL'nin tam yolu belirlendikten sonra dosyanın ve üst dizinlerinin izinlerine bakılır. Standart kullanıcının dosya oluşturma, değiştirme, silme ve yeniden adlandırma hakları, grup üyelikleriyle ve devralınan izinlerle birlikte değerlendirilmelidir.

Kurulum dizini, eklenti dizini, güncelleme alanı, geçici klasörler ve çalışma dizini farklı izinlere sahip olabilir. İzinler, test edilen kullanıcının erişim belirteciyle (access token) kontrol edilmelidir.

## DLL Hijacking Nasıl Önlenir?

### Tam yolu güvenilir kaynaktan oluşturmak

Örnekteki çağrı yalnızca modül adını kullanıyordu:

```text
module = LoadLibraryW("ReportPlugin.dll")
```

Tam yolu uygulamanın korunan kurulum bilgisinden oluşturup bağımlılık aramasını gerekli dizinlerle sınırlayabiliriz:

```text
trustedFullPath = "C:\Program Files\OrnekUygulama\bin\ReportPlugin.dll"

flags = LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR |
        LOAD_LIBRARY_SEARCH_SYSTEM32

module = LoadLibraryExW(trustedFullPath, null, flags)
```

`LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR` ana DLL'nin dizinini yalnızca onun bağımlılıkları için aramaya ekler ve tam yol gerektirir. `LOAD_LIBRARY_SEARCH_SYSTEM32` sistem dizinini kapsar. Bu çağrı çalışma dizini ve genel `PATH` dizinlerini ilgili yüklemenin bağımlılık aramasından çıkarır. Bayrakların güncel davranışı [LoadLibraryExW](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-loadlibraryexw) belgesinde tanımlanır.

Bu yol kullanıcı girdisinden, geçerli çalışma dizininden veya kullanıcının değiştirebildiği bir yapılandırma değerinden türetilmemelidir. Yükleme başarısız olduğunda uygulama, güvenilirliği belirsiz başka konumlarda aramaya devam etmemelidir.

### Süreç genelindeki arama kapsamını daraltmak

Birden fazla bileşen DLL yüklüyorsa `SetDefaultDllDirectories` ile süreç genelindeki varsayılan arama kapsamı belirlenebilir. Gerekli ek dizinler `AddDllDirectory` ile açıkça eklenebilir. `LOAD_LIBRARY_SEARCH_USER_DIRS` ifadesindeki user, kullanıcının bütün profil klasörlerini değil, uygulamanın bu API'lerle açıkça eklediği dizinleri anlatır.

`LOAD_LIBRARY_SEARCH_DEFAULT_DIRS`, uygulama dizinini, sistem dizinini ve bu API'lerle eklenen dizinleri kapsar. Microsoft, varsayılan aramanın bu kapsamla sınırlandırılmasını önerir. Ayrıntılar [SetDefaultDllDirectories](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-setdefaultdlldirectories) belgesinde bulunabilir.

### Kod ve veri dizinlerini ayırmak

EXE ve DLL dosyaları, standart kullanıcıların değiştiremediği kurulum dizinlerinde tutulmalıdır. Raporlar, günlükler, önbellekler ve kullanıcı ayarları ayrı veri dizinlerine yazılmalıdır. Bağlantı veya güncelleme sorununu çözmek için uygulamanın tüm klasörüne yazma izni vermek, kullanıcının çalıştırılacak kodu da değiştirebilmesine yol açar.

Kurulum ve güncelleme araçları da bu izinleri korumalıdır. Güncelleme sırasında dosyalar geçici konumdan kurulum dizinine güvenli biçimde taşınmalı, işlem sonunda yürütülebilir bileşenler ve dizin izinleri yeniden kontrol edilmelidir.

### Eksik bağımlılıkta güvenli davranmak

Zorunlu bir DLL güvenilir konumda bulunamıyorsa ilgili işlev, anlaşılır bir hata mesajıyla durmalıdır. İsteğe bağlı bir bileşen eksikse yalnızca ona bağlı özellik devre dışı bırakılabilir. Uygulama, çalışmaya devam etmek için çalışma dizininde veya rastgele `PATH` konumlarında alternatif kopya aramamalıdır.

## Düzeltmenin Doğrulanması

Düzeltmeden önceki ve sonraki sürümler, aynı kullanıcıyla ve aynı işlev akışı izlenerek karşılaştırılmalıdır. Her iki sürümün kayıtlarında da süreç kimliği ve tam yükleme yolu görünmelidir.

| Kontrol | Beklenen davranış |
|---|---|
| Uygulamanın normal kullanımı | İşlev beklenen şekilde tamamlanır |
| Yüklenen modülün yolu | Korunan ve tanımlanmış konumla eşleşir |
| Kod dizininin izinleri | Standart kullanıcı değiştirme hakkına sahip değildir |
| Zorunlu bağımlılığın eksikliği | İlgili işlev anlaşılır bir hata mesajıyla durur |
| İsteğe bağlı bağımlılığın eksikliği | Yalnızca ilgili özellik devre dışı kalır |
| Güncelleme sonrası durum | Yükleme politikası ve dosya izinleri korunur |

Son kontrolde, beklenen DLL'nin korunan konumdan yüklendiğini ve uygulamanın normal işlevlerinin çalıştığını görmeliyiz. Daha önce kullanılan yazılabilir konumun arama kapsamından çıkarıldığını da yükleme kayıtlarından doğrulamalıyız.

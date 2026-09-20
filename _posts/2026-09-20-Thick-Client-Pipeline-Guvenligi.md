---
title: "Thick Client Pipeline Güvenliği"
date: 2026-09-20 15:00:00 +0300
categories: [Thick Client Security]
tags: [windows, named-pipes, ipc, dotnet, pentest, hardening]
lang: tr
description: "Windows thick client uygulamalarında zayıf Named Pipe izinlerinin tespiti, doğrulanması, kontrollü sömürüsü ve geliştiriciler için hardening yöntemleri."
---

Bir masaüstü uygulamasında yönetim seçeneklerinin gizlenmiş olması, arka plandaki servisin aynı yetki sınırını uyguladığı anlamına gelmez. Arayüz standart kullanıcıyla, servis ise yönetici veya `SYSTEM` hesabıyla çalışıyorsa aralarındaki iletişim kanalı doğrudan bir güven sınırına dönüşür. Bu sınır yanlış kurulursa düşük yetkili bir kullanıcı, servise kendi yetkileriyle yapamayacağı işlemleri yaptırabilir.

Bu yazıda Windows tabanlı thick client uygulamalarındaki Named Pipe iletişimini bir pentester gözüyle inceleyeceğiz. Bir pipe adını bulmakla gerçek bir güvenlik açığını kanıtlamak arasındaki farkı, zayıf DACL ve uygulama seviyesi yetkilendirme hatalarının nasıl zincirlendiğini, kontrollü laboratuvarımızda bu zincirin nasıl sömürüldüğünü ve geliştiricilerin aynı sınırı nasıl sağlamlaştırabileceğini göstereceğiz.

> **Terim notu:** Başlıktaki “pipeline” ifadesi bu yazıda Windows **Named Pipes** iletişimini anlatıyor. Teknik terim named pipe'dır; CI/CD build ve deployment pipeline'ları bu yazının konusu değildir.

## Pipeline Nedir?

### Windows Named Pipes ve IPC

IPC, aynı veya farklı sistemlerdeki süreçlerin veri alışverişi yapmasını sağlayan mekanizmaların genel adıdır. Named pipe ise bir sunucu süreç ile bir veya daha fazla istemci arasında tek ya da çift yönlü iletişim kuran, adı olan bir Windows nesnesidir. “Sunucu” burada ayrı bir bilgisayar olmak zorunda değildir; aynı makinede çalışan bir Windows servisi de pipe sunucusu olabilir. Ayrıntılı davranış Microsoft'un [Named Pipes](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipes) belgesinde açıklanır.

Örnek bir yerel pipe yolu şöyledir:

```text
\\.\pipe\Example.Reporting
```

Bu ad yalnızca iletişim noktasını tanımlar. Bağlanan sürecin güvenilir olduğunu, gönderdiği rol bilgisinin doğru olduğunu veya istediği işleme yetkili olduğunu kanıtlamaz.

### Bir thick client neden named pipe kullanır?

Bir ERP, muhasebe veya yönetim uygulamasında kullanıcı arayüzü, güncelleme bileşeni, yazdırma servisi ve arka plan görev yöneticisi farklı süreçlerde çalışabilir. Böylece uzun süren işler arayüzü kilitlemez; servisler bağımsız yönetilir ve yalnızca ihtiyaç duyan bileşen daha yüksek yetkiyle çalıştırılabilir.

Bu mimarinin bedeli yeni bir güven sınırıdır. İstemci standart kullanıcıyla, servis yüksek yetkiyle çalışıyorsa servis şu soruların her birine cevap vermelidir:

1. Bu kanala kim bağlanabilir?
2. Bağlanan istemcinin doğrulanmış kimliği nedir?
3. Bu kimlik istenen işlemi yapabilir mi?
4. İstenen kaynak üzerinde ayrıca yetkisi var mı?

![Thick client, named pipe, Windows servisi ve korunan kaynak arasındaki güven sınırı](/assets/images/thick-client-pipeline/01-ipc-mimarisi.png)
_Şekil 1 — Arayüz ile yüksek yetkili servis arasındaki named pipe, uygulamanın güvenlik sınırlarından biridir._

## Neden Zafiyet Doğurabilir?

Named pipe kullanmak tek başına zafiyet değildir. Risk, kanala kimlerin erişebildiği ve kanalın hangi işlevleri hangi hesapla sunduğuyla belirlenir. Pipe'a bağlanabilmek ile servis üzerinden yetkisiz bir işlem yaptırabilmek aynı bulgu değildir.

| Zayıflık | Gerekli ek koşul | Olası sonuç |
|---|---|---|
| Gereğinden geniş DACL | Pipe hassas veri veya işlev sunuyor | Yetkisiz erişim ya da işlem talebi |
| İstemciden gelen role güvenmek | Servis rolü kendi tarafında doğrulamıyor | Uygulama içi yetki aşımı |
| Girdiyi servis yetkisiyle işlemek | Servis korunan kaynağa erişebiliyor | Yerel yetki sınırının aşılması |
| Genel amaçlı dosya/komut işlemi sunmak | Kullanıcı hedefi veya parametreyi belirleyebiliyor | Dosya değişikliği veya kod çalıştırma |
| Mesaj sınırı ve şema kontrolünün olmaması | İşleyici hatalı girdiyi güvenli reddedemiyor | Hizmet kesintisi veya beklenmeyen işlem |
| Aşırı yetkili veritabanı hesabı | İstekler ortak yüksek yetkili hesapla yürütülüyor | Gereğinden fazla veri erişimi/değişikliği |

Windows, pipe bağlantısında istemcinin access token'ını nesnenin DACL'iyle karşılaştırır. Fakat bağlantı izni uygulama içindeki bütün işlemlerin izni değildir. DACL ilk kapıdır; kimlik doğrulama, işlem yetkisi ve kaynak yetkisi ayrı karar noktalarıdır.

![Named pipe güvenlik kararlarının sırası](/assets/images/thick-client-pipeline/02-yetki-kontrolleri.png)
_Şekil 2 — Her kontrol bağımsızdır; herhangi biri başarısız olduğunda işlem durmalıdır._

Yetki yükseltme iddiası için yüksek yetkili bir servisin varlığı yeterli değildir. Düşük yetkili kimliğin doğrudan gerçekleştiremediği bir işlemi servis üzerinden yaptırabildiğini göstermemiz gerekir. Başlangıç yetkisi, servis hesabı, değişen kaynak ve işlem sonucu aynı kanıt zincirinde yer almalıdır.

## Nasıl ve Ne Durumda Pipeline Güvensiz Olur?

### “Bu pipe'a yalnızca bizim EXE bağlanır” varsayımı

Bir dosyanın adı, imzası, PID'si veya arayüzdeki rol bilgisi tek başına kimlik kanıtı değildir. Düşük yetkili kullanıcı pipe'a bağlanabiliyorsa meşru istemcinin ürettiği mesajları kendi istemcisiyle yeniden oluşturabilir. Servis aşağıdaki gibi bir karara güveniyorsa rolü belirleyen taraf fiilen istemci olur:

```csharp
if (request.Role == "admin")
{
    WriteProtectedFile(request.Value);
}
```

Burada saldırgan Windows token'ını değiştirmez. Yalnızca JSON içindeki `role` alanını değiştirir. Servis bu iddiayı doğrulamadan kabul ederse arayüzde saklanan yönetim işlevi doğrudan çağrılabilir.

### DACL'yi bağlantı sorununu çözmek için genişletmek

DACL, pipe nesnesine hangi SID'lerin hangi haklarla erişebileceğini belirler. `Everyone`, `Authenticated Users` veya `Users` gibi geniş gruplara yazma ve tam kontrol vermek, yüksek yetkili servisin saldırı yüzeyini büyütür.

Named pipe haklarında genel yazma izni ayrıca dikkat gerektirir. Windows'ta `FILE_APPEND_DATA` ile `FILE_CREATE_PIPE_INSTANCE` aynı bit değerini kullanır; Microsoft bu nedenle genel yazma hakkı yerine ihtiyaç duyulan hakların tek tek verilmesini önerir. Ayrıntılar [Named Pipe Security and Access Rights](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights) belgesinde bulunabilir.

Üç kavramı birbirinden ayırmak gerekir:

- **NULL DACL:** Herkese erişim verir.
- **Boş DACL:** İzin veren kayıt içermez ve erişimi engeller.
- **Özel security descriptor vermemek:** Windows'un varsayılan tanımlayıcısını kullanır; otomatik olarak NULL DACL anlamına gelmez.

Varsayılan tanımlayıcı da her mimari için doğru değildir. Güvenlik politikası, hedef istemci hesabı ve ihtiyaç duyulan haklar açıkça tanımlanmalıdır.

### Bağlantı iznini işlem yetkisi saymak

Bir kullanıcının servis durumunu görüntüleyebilmesi, ayar değiştirebilmesi gerektiği anlamına gelmez. Aynı pipe üzerinde hem herkese açık durum sorguları hem de ayrıcalıklı yönetim işlemleri bulunabilir. Bu nedenle yalnızca bağlantı sırasında kontrol yapmak yeterli değildir; servis her mesajda işlem ve kaynak bazında yeniden karar vermelidir.

### Impersonation hataları

`RunAsClient` veya `ImpersonateNamedPipeClient`, sunucunun istemci güvenlik bağlamında kontrol yapmasını sağlar. Impersonation kurulamazsa işlem servisin kendi yetkileriyle devam etmemeli, güvenli biçimde reddedilmelidir. Bağlamın doğru geri alınması ve bütün hata dönüşlerinin kontrol edilmesi gerekir. Native API davranışı [ImpersonateNamedPipeClient](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-impersonatenamedpipeclient) belgesinde açıklanır.

### SQL bağlantısını pipe güvenliğiyle karıştırmak

Thick client ile SQL Server arasında iki farklı mimari görülebilir:

```text
A: Thick client → SQL Server'ın Named Pipes protokolü
B: Thick client → uygulamaya ait named pipe → servis → SQL Server
```

A modelinde pipe, SQL Server bağlantısının taşıma yöntemidir. Pipe'ı SQL Server servisi oluşturur; Windows erişimi ile SQL login, user ve rol izinleri ayrı katmanlardır. Thick client'ın bağlantı dizesinde ortak bir SQL hesabı taşıması, hesabın aşırı yetkili olması veya kullanıcı yetkisinin yalnızca arayüzde uygulanması burada incelenmesi gereken asıl risklerdir.

B modelinde SQL bağlantısını aracı servis kurar. Bu kez pipe'a gelen kullanıcının hangi sorgu veya iş işlemini başlatabildiği ve servisin veritabanında hangi hesapla çalıştığı önem kazanır. Her iki modelde de “Named Pipes açık” sonucu tek başına SQL yetki aşımı anlamına gelmez.

## Bir Pentester Zafiyeti Nasıl Tespit Eder ve Doğrular?

İnceleme dört aşamadan oluşur: endpoint'i bulmak, erişimi doğru kullanıcıyla doğrulamak, protokolü anlamak ve ölçülebilir etkiyi göstermek.

### 1. Test bağlamını kaydetmek

İstemcinin, servisin ve analiz aracının hangi hesapla ve hangi integrity level ile çalıştığını kaydetmeden DACL sonucu yorumlanmamalıdır. Yönetici olarak çalışan analiz aracının bağlanabilmesi, standart kullanıcının da bağlanabildiğini göstermez.

Bu laboratuvarda:

- `YaziPipeLab.Client.exe` standart kullanıcıyla,
- `YaziPipeLab.Server.exe` UAC ile yükseltilmiş yönetici bağlamında,
- `YaziPipeLab.AdminPipe` çift yönlü yerel kanal olarak,
- `%ProgramFiles%\YaziPipeLab\protected-output.txt` ise sentetik korunan kaynak olarak kullanıldı.

Sunucu keyfî komut veya dosya yolu kabul etmiyor. Etki yalnızca laboratuvara ait sabit dosya ve örnek sır üzerinde gösterildi.

### 2. Pipe'ı bulmak ve hedef süreçle eşleştirmek

PowerShell üzerinden mevcut pipe adları listelenebilir:

```powershell
[System.IO.Directory]::GetFiles('\\.\pipe\') |
    Where-Object { $_ -like '*YaziPipeLab*' }
```

Gerçek bir değerlendirmede bu liste yalnızca başlangıçtır. Uygulama açık ve kapalıyken alınan sonuçlar karşılaştırılabilir; Process Monitor'da `\Device\NamedPipe\` yolları ve hedef süreç filtrelenebilir; Process Explorer veya `handle.exe` ile açık handle'ın sahibi doğrulanabilir. .NET uygulamalarında `NamedPipeClientStream` ve `NamedPipeServerStream`, native uygulamalarda ise `CreateNamedPipeW`, `ConnectNamedPipe`, `ReadFile` ve `WriteFile` çağrıları aranabilir.

### 3. DACL ve gerçek erişimi birlikte değerlendirmek

[SafiyeMonitor](https://github.com/ErenCanOzmn/SafiyeMonitor) taramasında laboratuvar pipe'ı erişilebilir olarak bulundu. DACL analizinde sahip `BUILTIN\Administrators`, riskli ACE ise `Everyone (0x001F019F)` olarak görüntülendi. SDDL çıktısındaki `WD`, Everyone SID'ini temsil ediyor.

![SafiyeMonitor üzerinde erişilebilir pipe ve zayıf DACL bulgusu](/assets/images/thick-client-pipeline/03-safiye-zayif-dacl.png)
_Şekil 3 — SafiyeMonitor, Everyone grubuna verilen geniş hakkı aday bulgu olarak işaretliyor._

Araç çıktısı tek başına nihai etki değildir. Aynı DACL standart kullanıcı PowerShell oturumundan okunarak `Everyone / FullControl / Allow` kaydı ayrıca doğrulandı.

![PowerShell ile Everyone FullControl ACE doğrulaması](/assets/images/thick-client-pipeline/04-powershell-dacl-dogrulama.png)
_Şekil 4 — Aynı güvenlik tanımlayıcısının bağımsız PowerShell kontrolü._

Bu iki görüntü, düşük yetkili kullanıcının kanala ulaşabildiğini ve güvenlik tanımlayıcısının gereğinden geniş olduğunu gösterir. Henüz yerel yetki yükseltme kanıtlanmış değildir; bunun için servis üzerinden korunan bir işlemin gerçekleşmesi gerekir.

### SafiyeMonitor olmadan manuel doğrulama

Bir pentesterın özel bir araca bağlı kalması gerekmez. Kontrollü bir istemci bağlantısı PowerShell ile kurulabilir:

```powershell
$pipe = [System.IO.Pipes.NamedPipeClientStream]::new(
    '.',
    'YaziPipeLab.AdminPipe',
    [System.IO.Pipes.PipeDirection]::InOut
)
$pipe.Connect(3000)
```

Bağlantının başarılı olması yalnızca pipe instance'ına erişilebildiğini kanıtlar. Hassas işlem için protokolün anlaşılması gerekir. Bu aşamada meşru istemcinin zararsız istekleri gözlenebilir, .NET serialization kodu incelenebilir veya `ReadFile`/`WriteFile` çağrıları debugger ile takip edilebilir. Bilinmeyen üretim protokolüne rastgele veri göndermek yerine yetkili laboratuvarda sentetik istek kullanılmalıdır.

Laboratuvar protokolü satır sonuyla biten basit bir JSON mesajıdır:

```json
{"action":"readSecret","role":"admin","value":null}
```

Servis hatalı olarak `role` alanını doğrulanmış kimlik kabul eder. Standart kullanıcı önce korunan dosyaya doğrudan yazmayı denedi ve Windows erişimi tarafından reddedildi. Aynı oturumdan `role=admin` mesajı gönderildiğinde ise servis örnek sırrı döndürdü.

![Standart kullanıcının doğrudan yazma reddi ve role admin ile örnek sırra erişmesi](/assets/images/thick-client-pipeline/05-manuel-somuru-kaniti.png)
_Şekil 5 — Aynı standart kullanıcı doğrudan korunan kaynağa erişemiyor, fakat istemci kontrollü rol alanıyla ayrıcalıklı servis işlevini çağırabiliyor._

### 4. Ayrıcalıklı etkiyi göstermek

Uygulama içi rol aşımı ile işletim sistemi seviyesindeki etkiyi ayırmak için ikinci bir istek kullandık:

```json
{"action":"writeProtected","role":"admin","value":"SAFIYE-POC: Standart kullanici ayricalikli pipe uzerinden bu satiri yazdi"}
```

Standart kullanıcı `%ProgramFiles%` altındaki laboratuvar dosyasına doğrudan yazamazken yükseltilmiş sunucu aynı dosyayı değiştirdi. SafiyeMonitor'daki istek, başarılı sunucu yanıtı ve Notepad'deki sonuç aynı görüntüde kaydedildi.

![SafiyeMonitor ile ayrıcalıklı dosya yazma ve dosyadaki sonuç](/assets/images/thick-client-pipeline/06-safiye-ayricalikli-dosya-yazma.png)
_Şekil 6 — Düşük yetkili istemcinin belirlediği veri, yüksek yetkili servis tarafından korunan laboratuvar dosyasına yazıldı._

Bu sonuç yerel yetki sınırının ölçülebilir biçimde aşıldığını gösterir. Ancak laboratuvar keyfî dosya yolu veya komut kabul etmediği için etki “yönetici kabuğu elde edildi” şeklinde genişletilemez. Kanıtlanan durum, standart kullanıcının doğrudan değiştiremediği belirli bir OS kaynağını yükseltilmiş servis üzerinden değiştirebilmesidir.

### Kanıt merdiveni

| Gözlem | Kanıtladığı | Tek başına kanıtlamadığı |
|---|---|---|
| Pipe adı bulundu | IPC endpoint'i mevcut | Hedef uygulamaya ait olduğu |
| Hedef süreç pipe'ı açtı | Süreç ile pipe ilişkili | Standart kullanıcının erişebildiği |
| Standart kullanıcı bağlandı | Bağlantı erişimi var | Hassas işlem yetkisi olduğu |
| Mesaj ve yanıt kaydedildi | Protokol kullanılabiliyor | Yetki sınırının aşıldığı |
| Sahte rol ile korunan işlev çalıştı | Uygulama yetkilendirmesi aşılabiliyor | OS seviyesinde privilege escalation olduğu |
| Servis korunan OS kaynağını değiştirdi | Yerel yetki yükseltme etkisi var | Keyfî kod çalıştırılabildiği |

Bu ayrım rapor kalitesini doğrudan etkiler. “Pipe erişilebilir” aday saldırı yüzeyidir; “düşük yetkili kullanıcı korunan kaynağı servis ayrıcalığıyla değiştirdi” ise doğrulanmış etkidir.

## Pipeline Hardening

Kalıcı çözüm tek bir `if` veya tek bir DACL değişikliğinden oluşmaz. Bağlantı erişimi ve uygulama seviyesi yetkilendirme birlikte düzeltilmelidir.

### Pipe DACL'ini açıkça tanımlamak

Laboratuvarın zafiyetli sürümünde pipe şu mantıkla oluşturuluyordu:

```csharp
security.AddAccessRule(new PipeAccessRule(
    new SecurityIdentifier(WellKnownSidType.WorldSid, null),
    PipeAccessRights.FullControl,
    AccessControlType.Allow));
```

Hardened sürümde erişim yalnızca mimarinin gerçekten ihtiyaç duyduğu `Administrators` ve `SYSTEM` SID'leriyle sınırlandı. Genel bir üründe bu SID'ler doğrudan kopyalanmamalı; ürünün servis hesabı, istemci grubu ve işlem modeli için gereken en dar haklar seçilmelidir.

Aynı kullanıcı ve aynı yükseltme düzeyindeki süreçler için `.NET` üzerindeki `PipeOptions.CurrentUserOnly` yararlı olabilir. Microsoft belgesine göre Windows'ta hem kullanıcı hesabını hem de elevation level'ı kontrol eder. Farklı hesaplarla çalışan servis mimarilerinde ise açık bir `PipeSecurity` politikası gerekir. Ayrıca `NamedPipeServerStreamAcl.Create` çağrısında `CurrentUserOnly` kullanılırsa geçirilen özel `PipeSecurity` yok sayılır; iki mekanizmanın birleştiği varsayılmamalıdır. Bkz. [PipeOptions](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.pipeoptions?view=net-10.0) ve [NamedPipeServerStreamAcl.Create](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.namedpipeserverstreamacl.create?view=net-10.0).

### Rolü mesajdan değil bağlantıdan almak

İstemcinin gönderdiği `role`, `isAdmin` veya kullanıcı adı yetki kararında kaynak kabul edilmemelidir. Sunucu gerçek Windows kimliğini bağlantı üzerinden almalı ve sunucu tarafındaki politikayla değerlendirmelidir:

```csharp
WindowsIdentity? caller = null;
pipe.RunAsClient(() =>
    caller = WindowsIdentity.GetCurrent(TokenAccessLevels.Query));

using (caller)
{
    var principal = new WindowsPrincipal(caller!);
    if (!principal.IsInRole(WindowsBuiltInRole.Administrator))
        throw new UnauthorizedAccessException();
}
```

Kimlik belirlenemiyorsa veya impersonation başarısızsa işlem servis hesabıyla devam etmemeli, reddedilmelidir. Bağlantı iznini geçen kimlik için işlem ve kaynak yetkisi yine ayrı kontrol edilmelidir.

![Zafiyetli ve hardened Named Pipe kodlarının karşılaştırması](/assets/images/thick-client-pipeline/07-kod-hardening-karsilastirmasi.png)
_Şekil 7 — Sol tarafta Everyone/FullControl ve istemci kontrollü rol; sağ tarafta daraltılmış DACL ve gerçek Windows token'ı bulunuyor._

### Servisin yapabileceklerini sınırlamak

Servis yalnızca işlevinin gerektirdiği işletim sistemi izinleriyle çalışmalıdır. Mesaj protokolü keyfî komut, dosya yolu veya SQL metni kabul eden genel amaçlı bir yürütme arayüzüne dönüşmemelidir. İşlem adları allowlist ile tanımlanmalı; kaynak kimlikleri, mesaj boyutları ve alan tipleri doğrulanmalıdır.

Yerel kullanım bekleniyorsa uzak istemciler ayrıca engellenmelidir. Native API kullanan servislerde `PIPE_REJECT_REMOTE_CLIENTS` mimariye göre değerlendirilebilir. İlk pipe instance'ını korumak, istemci ve sunucu kimliğinin doğrulanmasının yerine geçmez.

### SQL tarafını ayrıca sağlamlaştırmak

Pipe güvenli olsa bile SQL sorgusu kullanıcı girdisiyle birleştiriliyorsa SQL injection riski devam eder:

```csharp
string sql = "SELECT Status FROM Reports WHERE Code = '" + reportCode + "'";
```

Parametreli sorgu kullanılmalıdır:

```csharp
using var command = new Microsoft.Data.SqlClient.SqlCommand(
    "SELECT Status FROM Reports WHERE Code = @code", connection);

command.Parameters.Add("@code", System.Data.SqlDbType.NVarChar, 64)
    .Value = reportCode;
```

Parametre kullanmak girdinin SQL kodu olarak yorumlanmasını engeller; kullanıcının ilgili rapora erişim hakkını sağlamaz. Kaynak yetkisi ayrıca kontrol edilmeli, veritabanı hesabına yalnızca gereken tablo ve işlemler için izin verilmelidir. Ortak yönetici parolasını istemci EXE'sinde taşımak yerine sunucu tarafı kimlik ve sır yönetimi tercih edilmelidir. ADO.NET parametreleri için [Microsoft'un yapılandırma belgesi](https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/configuring-parameters-and-parameter-data-types) incelenebilir.

### Düzeltmeyi yeniden test etmek

Hardening iki farklı bağlamda yeniden test edildi. SafiyeMonitor backend'i yönetici yetkisiyle çalıştığı için `Administrators` ile sınırlandırılmış pipe'a bağlanabildi. Buna rağmen aynı `writeProtected` isteği bu kez uygulama katmanında `denied` sonucunu aldı. Görseldeki `Everyone` risk bilgisi vulnerable aşamada yapılan taramadan panelde kalan önceki kayıttır; post-hardening DACL ölçümü olarak kullanılmamalıdır.

![Hardened modda ayrıcalıklı işlemin servis tarafından reddedilmesi](/assets/images/thick-client-pipeline/08-hardened-islem-reddi-safiye.png)
_Şekil 8 — Pipe'a bağlanabilen yükseltilmiş analiz aracı bile istemci kontrollü `role=admin` alanıyla ayrıcalıklı işlemi yaptıramıyor._

Ardından aynı standart kullanıcı ve aynı PowerShell bağlantı koduyla test tekrarlandı. Pipe DACL'i artık düşük yetkili token'a bağlantı izni vermediği için `Connect` çağrısı `UnauthorizedAccessException` ile reddedildi.

![Hardened pipe üzerinde standart kullanıcının bağlantısının reddedilmesi](/assets/images/thick-client-pipeline/09-hardened-erisim-reddi.png)
_Şekil 9 — Aynı test kullanıcısı ve aynı istemci kodu, hardened DACL sonrasında pipe'a bağlanamıyor._

Bir düzeltmenin başarılı sayılması için yalnızca saldırı isteğinin reddedilmesi yetmez. Meşru kullanım da doğrulanmalıdır:

| Test | Beklenen sonuç |
|---|---|
| Yetkili kimlik, izinli işlem ve kaynak | İşlem tamamlanır |
| Yetkisiz kimlik | Bağlantı veya işlem katmanında reddedilir |
| Bağlanabilen kimlik, izinsiz işlem | Servis tarafından reddedilir |
| Kimliği belirlenemeyen istek | İşlem başlamadan reddedilir |
| Geçersiz veya aşırı uzun mesaj | Kaynak sınırları korunarak reddedilir |
| Yeniden bağlantı veya rol değişikliği | Önceki yetki kararı taşınmaz |
| Normal uygulama akışı | Tanımlanan veri sınırları içinde çalışır |

## Sonuç

Named pipe denetiminde en önemli soru pipe'ın bulunup bulunmadığı değildir: **Hangi kimlik, hangi işlemi, hangi hesabın yetkileriyle gerçekleştirebiliyor?**

Laboratuvarımızda `Everyone: FullControl` DACL'i düşük yetkili kullanıcının kanala ulaşmasını sağladı; istemciden gelen `role=admin` değerine güvenilmesi uygulama yetkilendirmesini kaldırdı; yükseltilmiş servisin korunan dosyayı değiştirmesi ise bu iki hatayı ölçülebilir bir yerel yetki yükseltme etkisine dönüştürdü.

Sağlam bir çözüm de aynı zinciri tersinden kurmalıdır: pipe erişimini en dar SID ve haklarla sınırlandırmak, kimliği bağlantının Windows token'ından almak, her işlemi ve kaynağı sunucu tarafında yetkilendirmek, servisin yetkilerini azaltmak ve düzeltmeyi aynı düşük yetkili kullanıcıyla yeniden test etmek.

Bir pentester açısından güçlü bulgu, yalnızca zayıf bir ACE ekran görüntüsü değildir. Başlangıç yetkisi, erişim kontrolü, protokol isteği, servis kararı, korunan kaynak üzerindeki sonuç ve hardening sonrası ret birlikte gösterildiğinde hem etki hem de çözüm tartışmasız hâle gelir.

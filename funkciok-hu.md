# Az oldal funkciói

Ez az oldal egy magyar nagyhajós vitorlázó közösséghez készült crew-matching és legénységtoborzó platform. Az alábbi funkciókat tudja:

## Fő cél

- Hajótulajdonosok és kapitányok legénységet kereshetnek a hajójukra.
- Vitorlázók szabad helyeket böngészhetnek, majd jelentkezhetnek a nekik megfelelő hajókra.
- A rendszer támogatja az egyszeri versenyeket és a szezonális, hosszabb távú csapatokat is.

## Nyitóoldal

A kezdőlap három változatban jelenik meg:

- **Vendégnek** (bejelentkezés nélkül):
  - hős rész két úttal: „Szabad helyek böngészése” és „Legénységet keresek”;
  - a szabad helyek és hajók aktuális száma;
  - friss hirdetések;
  - „Hogyan működik?” matróz- és kapitánylépésekkel;
  - regisztrációs felhívás.
- **Matróznak** (bejelentkezett, saját hajó nélkül): ez egyben a „Vitorlázásaim” nézet.
  - Új felhasználónál: kezdő lépések, az „Így jutsz fel egy hajóra” magyarázat, kezdőbarát szabad helyek szerepszűrővel.
  - Függő csapatmeghívónál: a meghívó a köszöntés helyére kerül „Elfogadom” és „Most nem” gombbal. Ha több meghívó vár, egyszerre egy látszik, mellette „és még N meghívód van”.
  - A következő vitorlázás kártyája:
    - időjárás és a kapitány megjegyzése;
    - kik jönnek;
    - „Mégsem tudok menni” gomb.
  - Egyetlen időrendi, hónapokra bontott lista: minden esemény a saját állapotával (válaszra vár, megyek, nem mész), „Mind / Válaszra vár / Megyek” szűrővel.
  - Mellette a csapataid és a jelentkezéseid; több csapatnál hajónkénti színjelölés.
  - Az elfogadott jelentkezés nem jelenik meg kétszer: ha az alkalma már a csapat eseményei között van, csak az esemény látszik.
  - Ha a csapatnak nincs közelgő eseménye, a lista ezt írja ki; betöltési hibánál hibaüzenet jelenik meg, nem a kezdő lépések.
- **Kapitánynak** (akinek hajója van): a saját hajó zónája, és ha máshol is legénység, a „Más hajókon” kivonat.
  - Új hajónál kezdő lépések: csapat meghívása és az első esemény. A hirdetés nem kötelező lépés, csak ajánlásként jelenik meg.
- **Hiányos profil:** ha hiányzik a név, a telefonszám vagy a tapasztalat, egy figyelmeztető sáv jelenik meg a kezdőlap tetején.

## Vitorlázásaim

- Külön menüpont annak a kapitánynak, aki más hajón is csapattag vagy résztvevő.
- A számláló mutatja, hány esemény vár válaszra.
- Ugyanazt a teljes legénység-nézetet mutatja, mint a matróz kezdőlapja.

## Felhasználói szerepek

- Mancsaft / legénységi felhasználó.
- Kapitány / skipper felhasználó.
- A szerep alapján más funkciók és nézetek jelennek meg.

## Bejelentkezés és regisztráció

- Email és jelszavas bejelentkezés.
- Regisztráció új felhasználóknak.
- Kapitányi regisztráció külön csapat- és hajóadatokkal.
- Profilkép feltöltés regisztrációkor.
- Automatikus session-kezelés Supabase segítségével.
- Kijelentkezés a fejlécből.

## Jelszó-visszaállítás

- Visszaállító email küldése a regisztrált email címre.
- A recovery link ellenőrzése után a felhasználó új jelszót állíthat be.
- Supabase kódos, tokenes és hash alapú recovery linkek kezelése.
- A Supabase megerősítő URL-jét tartalmazó email link átirányítása a recovery folyamatba.
- A jelszónak legalább 8 karakter hosszúnak kell lennie, a két megadott jelszónak egyeznie kell.
- Sikeres mentés után automatikus kijelentkeztetés.

## Böngészés oldal

- Aktív hirdetések listázása.
- Szűrés az alábbiak szerint:
  - elköteleződés típusa
  - keresett pozíció (multi-select dropdown)
  - tapasztalati szint
- Hirdetések rendezése a legfrissebbek szerint.
- Megjeleníti a hajó nevét, képét, helyszínt, dátumot, szükséges posztokat és a jelentkezők számát.
- A "További részletek" gombbal kártyán belül megjeleníthető:
  - kapitány neve
  - kapitány profilképe
  - hirdetéshez fűzött kapitányi megjegyzés
- Egyszerre egy kártya részletei lehetnek nyitva.
- Jelentkezés gombbal lehet csatlakozni a kiválasztott hirdetéshez.
- Bejelentkezés nélkül auth modal nyílik meg.
- Saját jelentkezés visszavonása.

## Jelentkezések állapota

- Elbírálás alatt: a jelentkezés visszavonható.
- Elfogadva erre az alkalomra:
  - a „Megyek” listában jelenik meg, a kapitány megosztott elérhetőségével;
  - ez nem csapattagság.
- Elutasítva („Most nem jött össze”): elrejthető; ezt csak az adott böngésző jegyzi meg.

## Nyitott hirdetések a főoldalon

- A legfrissebb aktív hirdetésekből válogat.
- Kihagyja a saját, a már megpályázott és a saját csapatok hajóinak hirdetéseit.
- Kártyákon mutatja a hajó képét, a helyek számát, a kezdőbarát jelölést és a keresett szerepeket.
- Gyors ugrópontot ad a böngészés oldalra.

## Kapitányi vezérlőpult

- Csak kapitány felhasználóknak érhető el.
- Megmutatja az elsődleges hajót és annak alapadatait.
- Új hirdetés feladása a hajóhoz.
- Aktív hirdetések kezelése.
- Hirdetés lezárása.
- Hirdetés törlése.
- A lezárás és törlés ikonok mobilon is láthatók, nem csak hover állapotban.
- A lezárás és törlés műveletekhez tooltip tartozik.
- Hirdetésekhez érkező jelentkezők megtekintése.
- Jelentkezők elfogadása vagy elutasítása.
- Pending jelentkezések számának követése.

## Hirdetés létrehozása

- A kapitány hirdetést tud feladni a hajójához.
- Megadható:
  - cím
  - helyszín
  - kezdő dátum
  - végdátum vagy egynapos esemény
  - elköteleződés típusa
  - kit keres: „Segítő kezeket” (bárki jöhet) vagy „Konkrét posztokra”
    - posztok: Segítő legénység, Kormányos, Taktikus/navigátor, Nagyvitorla-kezelő, Orrvitorla-kezelő, Árbocnál, Orrban, plusz szabadon beírt egyéb poszt
  - hány főt keres összesen
  - kezdőbarát-e („Kezdőket is szívesen látok”)
  - rövid, opcionális kapitányi megjegyzés
- A rendszer ellenőrzi a kötelező mezőket.
- A hirdetés mentése után megjelenik a böngészésben.

## Hajóadatok kezelése

- Elsődleges hajó adatai láthatók a kapitányi felületen.
- Hajó név, típus és kikötő megjelenítése.
- A hajóhoz kapcsolódó aktív hirdetések és jelentkezések kezelése.

## Profilkezelés

- Felhasználói profil mentése Supabase users táblába.
- Név, email, telefonszám, születési dátum, szerep és avatar kezelése.
- A fejlécben a bejelentkezett felhasználó adatai jelennek meg.

## Értesítések és állapotok

- Csengő a fejlécben minden bejelentkezett felhasználónak (az elmúlt két hét eseményei, olvasatlan-számlálóval):
  - kapitánynak: ki jön / nem jön, új jelentkező, új csapattag;
  - legénységnek: új esemény a csapata hajóján, módosult egy esemény, amire megy, a kapitány lemondott (törölt) egy közelgő eseményt, döntés a jelentkezéséről, csapatmeghívó, kikerült egy csapatból.
- A jelentkezési döntés idejéhez az `application-decided-at-migration.sql` futtatása kell.
- A lemondott eseményekről és a csapatból eltávolításról a `crew_notices` tábla őrzi a nyomot; ehhez a `crew-notices-migration.sql` futtatása kell.
- Ha a kapitány eltávolít valakit a csapatból, a tag közelgő eseményekre adott válaszai törlődnek, és a matróz-nézetben csak az aktív csapatok eseményei látszanak.
- A kapitányi nézetben jelzés jelenik meg az új, függőben lévő jelentkezésekről.
- Műveletekhez visszajelző üzenetek tartoznak, például sikeres jelentkezés vagy hirdetés lezárása.

## Navigáció és megjelenés

- Rögzített felső navigációval rendelkezik.
- Láblécben elérhető:
  - Súgó oldal
  - ÁSZF oldal
  - Adatkezelési tájékoztató oldal
  - kattintható kapcsolat e-mail cím
- Reszponzív kialakítás mobilra és asztali nézetre.
- Kártyás, vizuálisan kiemelt felületet használ a fontos funkciókhoz.

## Adminisztráció

- Az adminisztrációs felületet csak a Supabase `admin_users` táblájában szereplő adminok érhetik el.
- A Platformkezelés a felhasználók, hirdetések, hajók és események keresésére, szűrésére, rendezésére, megtekintésére és szerkesztésére szolgál.
- Az elemek törlése soft delete; a hajó, illetve a felhasználó törlése a hozzá tartozó hirdetéseket és eseményeket is elrejti.
- A felhasználó tiltása a Supabase Auth belépést és az alkalmazás hitelesített API-/adatbázis-hozzáférését is letiltja.
- A bejelentéskezelés később készül el; jelenleg nincs bekötött bejelentési adatforrás.
- A telepítéshez az `admin-users-migration.sql`, majd az `admin-platform-migration.sql` migrációt kell futtatni a Supabase SQL Editorban.
- Az admin API-hoz a `SUPABASE_SERVICE_ROLE_KEY` csak szerveroldali környezeti változóként állítható be.

## Jogi és tájékoztató oldalak

- Külön ÁSZF oldal.
- Külön Adatkezelési Tájékoztató oldal.
- Külön Súgó oldal gyakori kérdésekkel és gyors induló leírással.

## Backend és adatok

- A teljes auth és adatelérés Supabase alapú.
- Kezelt adatok például:
  - users
  - boats
  - ads
  - applications
- Hirdetésekhez és jelentkezésekhez valós idejű lekérdezések és mentések tartoznak.

## Röviden

Az oldal fő értéke, hogy egy helyen köti össze a hajókat kereső kapitányokat és a fedélzetre jelentkező vitorlázókat, miközben kezeli a regisztrációt, a bejelentkezést és a jelszó-visszaállítást, a hirdetéskezelést, a jelentkezéskezelést és a jogi tájékoztatásokat is.
# Az oldal funkciói

Ez az oldal egy magyar nagyhajós vitorlázó közösséghez készült crew-matching és legénységtoborzó platform. Az alábbi funkciókat tudja:

## Fő cél

- Hajótulajdonosok és kapitányok legénységet kereshetnek a hajójukra.
- Vitorlázók szabad helyeket böngészhetnek, majd jelentkezhetnek a nekik megfelelő hajókra.
- A rendszer támogatja az egyszeri versenyeket és a szezonális, hosszabb távú csapatokat is.

## Nyitóoldal

- Erős hero szekcióval mutatja be a szolgáltatást.
- Két fő útvonalat kínál:
  - hajóm van, és legénységet keresek
  - hajóra szeretnék kerülni
- Közvetlen navigációt ad a böngészéshez és a kapitányi felülethez.

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

- Visszaállító link kezelése.
- Új jelszó beállítása recovery session alapján.
- Kódos, tokenes és hash alapú Supabase recovery támogatás.
- Érvényesítés:
  - legalább 8 karakter
  - a két jelszó egyezése
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

## Legutóbbi jelentkezések

- A bejelentkezett felhasználó legutóbbi jelentkezéseit mutatja.
- Megjeleníti a hirdetés címét, a hajó nevét, a helyszínt, a dátumot és az állapotot.
- A függőben lévő jelentkezések visszavonhatók.

## Nyitott hirdetések a főoldalon

- A legfrissebb aktív hirdetésekből válogat.
- Kártyákon mutatja a hajó képét és a fő információkat.
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
  - keresett posztok (többes kiválasztás)
    - Kormányos
    - Taktikus
    - Main Trim
    - Jib trim
    - Mast
    - Fordeck
  - elvárt tapasztalati szint
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

Az oldal fő értéke, hogy egy helyen köti össze a hajókat kereső kapitányokat és a fedélzetre jelentkező vitorlázókat, miközben kezeli a regisztrációt, belépést, jelszó-visszaállítást, hirdetéskezelést, jelentkezéskezelést és a jogi tájékoztatásokat is.
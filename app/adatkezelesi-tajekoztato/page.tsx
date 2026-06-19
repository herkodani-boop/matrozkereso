import { SiteFooter } from "@/components/site-footer"

export const metadata = {
  title: "Adatkezelési Tájékoztató | Matrózkereső",
  description: "A Matrózkereső platform adatkezelési tájékoztatója.",
}

export default function PrivacyNoticePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Adatkezelési Tájékoztató</h1>
          <p className="mt-2 text-sm text-muted-foreground">Hatályos: 2026.06.19.</p>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">1. Adatkezelő adatai</h2>
            <p>Név: Herko Dániel</p>
            <p>Nyilvántartási szám: 58237485</p>
            <p>Székhely: 1137 Budapest XIII., Angyalföldi út 5.</p>
            <p>Adószám: 43925346-1-41</p>
            <p>E-mail: matrozkereso@gmail.com</p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">2. A tájékoztató célja</h2>
            <p>
              Jelen tájékoztató összefoglalja, hogy a Matrózkereső platform használata során milyen személyes adatokat,
              milyen célból, milyen jogalapon és meddig kezelünk.
            </p>
          </section>

          <section className="mt-8 space-y-3 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">3. Kezelt adatok köre</h2>
            <p>A platform használata során különösen az alábbi adatok kezelése történhet:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>azonosító és kapcsolati adatok: név, e-mail cím, telefonszám,</li>
              <li>profiladatok: avatar, születési dátum, tapasztalati szint, preferált posztok,</li>
              <li>hirdetési adatok: hirdetés címe, helyszín, dátum, keresett posztok, kapitányi megjegyzés,</li>
              <li>jelentkezési adatok: jelentkezés státusza, jelentkezés időpontja,</li>
              <li>technikai adatok: naplóbejegyzések, munkamenet adatok, IP-címhez kapcsolódó biztonsági adatok.</li>
            </ul>
          </section>

          <section className="mt-8 space-y-3 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">4. Adatkezelési célok és jogalapok</h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>felhasználói fiók létrehozása és kezelése (GDPR 6. cikk (1) b),</li>
              <li>hirdetések közzététele és jelentkezések kezelése (GDPR 6. cikk (1) b),</li>
              <li>kapcsolattartás és ügyfélszolgálat (GDPR 6. cikk (1) b) és f)),</li>
              <li>jogszabályi kötelezettségek teljesítése, számviteli és adózási megfelelés (GDPR 6. cikk (1) c),</li>
              <li>a szolgáltatás biztonságának és működésének biztosítása (GDPR 6. cikk (1) f)).</li>
            </ul>
          </section>

          <section className="mt-8 space-y-3 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">5. Adatkezelés időtartama</h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>felhasználói profiladatok: a fiók megszüntetéséig,</li>
              <li>hirdetések és jelentkezések adatai: a szolgáltatás működéséhez szükséges ideig,</li>
              <li>számviteli bizonylatokon szereplő adatok: jogszabályban meghatározott ideig,</li>
              <li>naplóállományok: jellemzően rövid, biztonsági célú megőrzési idővel.</li>
            </ul>
          </section>

          <section className="mt-8 space-y-3 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">6. Adattovábbítás, adatfeldolgozók</h2>
            <p>
              A szolgáltatás működtetése során adatfeldolgozók vehetők igénybe, különösen tárhely- és infrastruktúra
              szolgáltatók, adatbázis- és authentikációs szolgáltatók.
            </p>
            <p>Jelenleg tipikusan igénybe vett technológiai szolgáltatók:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Supabase (adatbázis, authentikáció, storage),</li>
              <li>Vercel (hoszting és üzemeltetési infrastruktúra).</li>
            </ul>
            <p>
              Harmadik országba történő adattovábbítás esetén az Adatkezelő megfelelő garanciákat alkalmaz (pl. EU
              standard szerződéses klauzulák).
            </p>
          </section>

          <section className="mt-8 space-y-3 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">7. Az érintettek jogai</h2>
            <p>Az érintettet a GDPR alapján különösen az alábbi jogok illetik meg:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>hozzáféréshez való jog,</li>
              <li>helyesbítéshez való jog,</li>
              <li>törléshez való jog,</li>
              <li>adatkezelés korlátozásához való jog,</li>
              <li>adathordozhatósághoz való jog,</li>
              <li>tiltakozáshoz való jog.</li>
            </ul>
            <p>
              Kéréseit a fenti e-mail címen küldheti meg. Az Adatkezelő indokolatlan késedelem nélkül, de legkésőbb 30
              napon belül válaszol.
            </p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">8. Jogorvoslat</h2>
            <p>
              Ha úgy véli, hogy adatkezelésünk nem felel meg a jogszabályoknak, panaszt tehet a Nemzeti Adatvédelmi és
              Információszabadság Hatóságnál (NAIH), illetve bírósághoz fordulhat.
            </p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">9. Sütik és technikai azonosítók</h2>
            <p>
              A weboldal működéséhez szükséges technikai sütik és munkamenet azonosítók használata történhet. A
              statisztikai és analitikai mérés kizárólag a vonatkozó jogszabályoknak megfelelően történik.
            </p>
          </section>

          <section className="mt-8 space-y-2 text-sm leading-6 text-foreground">
            <h2 className="text-base font-semibold">10. A tájékoztató módosítása</h2>
            <p>
              Az Adatkezelő jogosult a jelen tájékoztatót módosítani. A módosított verzió a közzététellel lép hatályba.
            </p>
          </section>

        </article>
      </main>
      <SiteFooter />
    </div>
  )
}

import Link from "next/link";
import Image from "next/image";
import { GermanLocalizationBoundary } from "@/components/i18n/german-localization-boundary";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { getMessages } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const messages = getMessages(locale);
  return (
    <main className="flex min-h-screen bg-board-paper">
      <section className="hidden flex-1 items-center justify-center bg-board-navy p-10 text-white lg:flex">
        <div className="max-w-xl">
          <h1>
            <Image
              src="/coachboard-brand/coachboard-logo-horizontal-dark.png"
              alt={messages.app.name}
              width={1250}
              height={365}
              priority
              className="h-auto w-[min(100%,22rem)]"
            />
          </h1>
          <p className="mt-5 text-xl leading-8 text-slate-200">
            {messages.auth.hero}
          </p>
          <div className="pitch-grid mt-10 aspect-[16/9] rounded-lg border border-white/20 p-6">
            <div className="h-full rounded-lg border-2 border-white/70">
              <div className="mx-auto h-full w-px bg-white/70" />
            </div>
          </div>
        </div>
      </section>
      <section className="flex min-h-screen flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link href="/login" className="mb-8 block w-fit max-w-full" aria-label={messages.app.name}>
            <Image
              src="/coachboard-brand/coachboard-logo-horizontal-light.png"
              alt=""
              width={1250}
              height={365}
              priority
              className="h-auto w-48 max-w-full sm:w-52"
            />
          </Link>
          <I18nProvider locale={locale}>
            <GermanLocalizationBoundary locale={locale}>
              {children}
            </GermanLocalizationBoundary>
          </I18nProvider>
        </div>
      </section>
    </main>
  );
}

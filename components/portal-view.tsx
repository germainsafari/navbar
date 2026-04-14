"use client";

import { useState } from "react";

const WEBAPP_URL = "https://transportationsolutions.abb.com/";
const ABB_GLOBAL_URL = "https://www.abb.com/global/en";

type Destination = "webapp" | "abb-global";

const destinations: Record<Destination, string> = {
  webapp: WEBAPP_URL,
  "abb-global": ABB_GLOBAL_URL,
};

export function PortalView() {
  const [active, setActive] = useState<Destination>("webapp");
  const src = destinations[active];

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-zinc-200">
      <header className="flex shrink-0 items-stretch border-b border-zinc-200 bg-white">
        <nav
          className="flex items-center gap-8 border-l border-zinc-300 pl-4 py-3 pr-4"
          aria-label="Portal navigation"
        >
          <button
            type="button"
            onClick={() => setActive("webapp")}
            className={`text-sm text-black transition-[font-weight] hover:opacity-80 ${
              active === "webapp" ? "font-semibold" : "font-normal"
            }`}
            aria-current={active === "webapp" ? "page" : undefined}
          >
            Webapp
          </button>
          <button
            type="button"
            onClick={() => setActive("abb-global")}
            className={`text-sm text-black transition-[font-weight] hover:opacity-80 ${
              active === "abb-global" ? "font-semibold" : "font-normal"
            }`}
            aria-current={active === "abb-global" ? "page" : undefined}
          >
            ABB Global
          </button>
        </nav>
      </header>
      <main className="relative min-h-0 flex-1">
        <iframe
          key={src}
          src={src}
          title={active === "webapp" ? "ABB Transportation Solutions" : "ABB Global"}
          className="absolute inset-0 h-full w-full border-0 bg-white"
          allow="fullscreen"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </main>
    </div>
  );
}

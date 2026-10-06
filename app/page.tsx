import type { Metadata } from "next";
import Link from "next/link";
import { SnipMark } from "./snip-mark";

export const metadata: Metadata = {
  title: "Games · constantinemunoz.github.io",
  description: "Browser games to play with friends.",
};

// The site's front page: a shelf of games. Each game lives in its own folder
// (Snip No Evil is at /snip-no-evil/); add a card here for every new one.
export default function GamesHome() {
  return (
    <main className="hub-shell">
      <header className="hub-header">
        <span className="hub-eyebrow">constantinemunoz.github.io</span>
        <h1>GAMES</h1>
        <p>Pick a game to play.</p>
      </header>
      <nav className="hub-games" aria-label="Games">
        <Link className="hub-game" href="/snip-no-evil/">
          <span className="hub-game-art" aria-hidden="true"><span className="hub-game-monkeys">🙈🙉🙊</span><SnipMark className="hub-game-scissors" /></span>
          <span className="hub-game-title">SNIP NO EVIL</span>
          <span className="hub-game-blurb">Three friends, one bomb. One can&apos;t see, one can&apos;t hear, one can&apos;t speak.</span>
          <span className="hub-game-meta">3 PLAYERS · ONE VOICE CALL</span>
          <span className="hub-game-play">PLAY →</span>
        </Link>
        <div className="hub-game hub-game-soon" aria-hidden="true"><span className="hub-game-title">MORE GAMES</span><span className="hub-game-blurb">Coming soon.</span></div>
      </nav>
      <footer className="hub-footer">Snip No Evil is an unofficial browser tribute, not affiliated with Lefto Studio or TARK.</footer>
    </main>
  );
}

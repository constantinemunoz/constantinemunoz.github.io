import type { Metadata } from "next";
import GameClient from "../game-client";

export const metadata: Metadata = {
  title: "Snip No Evil — Three-Player Bomb Defusal",
  description: "An unofficial three-player browser bomb-defusal game. One player can't see, one can't hear, one can't speak.",
};

export default function SnipNoEvilPage() {
  return <GameClient />;
}

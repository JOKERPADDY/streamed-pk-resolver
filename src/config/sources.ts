const sourceCatalog = [
  { id: "admin", name: "Admin", description: "Admin added streams" },
  { id: "alpha", name: "Alpha", description: "Most reliable (720p 30fps)" },
  { id: "bravo", name: "Bravo", description: "Smoother (high fps, low bitrate)" },
  { id: "charlie", name: "Charlie", description: "Good backup" },
  { id: "delta", name: "Delta", description: "Okayish backup" },
  { id: "echo", name: "Echo", description: "Great quality overall" },
  { id: "foxtrot", name: "Foxtrot", description: "Good quality, home/away feeds" },
  { id: "golf", name: "Golf", description: "Very stable, good quality. Great backup" },
  { id: "hotel", name: "Hotel", description: "Very high quality feeds & many backups" },
  { id: "intel", name: "Intel", description: "Large event coverage, iffy quality" },
] as const;

const sourceTiers = [
  { priority: 1, sources: ["admin", "alpha", "golf"] },
  { priority: 2, sources: ["delta", "echo", "bravo", "charlie"] },
  { priority: 3, sources: ["foxtrot", "intel", "hotel"] },
] as const;

export function sourceRank(source: string): number {
  for (const tier of sourceTiers) {
    const index = (tier.sources as readonly string[]).indexOf(source);
    if (index >= 0) return tier.priority * 100 + index;
  }
  return 999;
}

export function sourceMeta(source: string): { name: string; description: string } {
  const hit = sourceCatalog.find((item) => item.id === source);
  return hit
    ? { name: hit.name, description: hit.description }
    : { name: source.charAt(0).toUpperCase() + source.slice(1), description: "" };
}

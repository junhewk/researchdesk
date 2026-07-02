import path from "path";

export function getConfiguredDataDir(): string | null {
  const configured =
    process.env.RESEARCHDESK_DATA_DIR?.trim() ||
    process.env.REVIEWER_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : null;
}

export function getDefaultDataDir(): string {
  return path.resolve(
    path.join(/* turbopackIgnore: true */ process.cwd(), "data"),
  );
}

export function resolveDataDir(): string {
  return getConfiguredDataDir() || getDefaultDataDir();
}

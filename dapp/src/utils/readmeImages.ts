import { fetchFromIpfs } from "utils/ipfsFunctions";
import { IpfsMissError } from "utils/ipfsMissCache";

/**
 * The images a README shows from its directory, as files for the new one; a
 * file already missing is left out. One that cannot be read stops the update
 * rather than go missing.
 */
export async function carriedImages(
  cid: string,
  readme: string,
  already: Set<string>,
): Promise<File[]> {
  const paths = [
    ...readme.matchAll(/!\[[^\]]*\]\((?!https?:\/\/)([^)]+)\)/g),
  ].flatMap(([, path]) => (path && !already.has(path) ? [path] : []));
  const files = await Promise.all(
    [...new Set(paths)].map(async (path) => {
      const response = await fetchFromIpfs(cid, path).catch((error) => {
        if (error instanceof IpfsMissError && error.scope === "path") {
          return null;
        }
        throw new Error(
          `Could not copy the README image ${path}: ${error.message}`,
        );
      });
      if (!response) return null;
      const blob = await response.blob();
      return new File([blob], path, { type: blob.type });
    }),
  );
  return files.filter((file) => file !== null);
}

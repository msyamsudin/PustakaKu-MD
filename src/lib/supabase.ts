import { fetch } from "@tauri-apps/plugin-http";
import { logger } from "./logger";

export interface SupabaseConfig {
  url: string;          // https://[ref-id].supabase.co
  serviceKey: string;   // service_role / secret key
  bucket: string;       // e.g. "page-images"
}

/**
 * Calculates an adaptive TTL for signed URLs.
 * Formula: (estimatedSecsPerPage × totalPages) + 60s buffer
 * Minimum TTL is 120 seconds.
 */
export function calculateAdaptiveTTL(
  totalPages: number,
  estimatedSecsPerPage = 15
): number {
  const calculated = estimatedSecsPerPage * totalPages + 60;
  return Math.max(calculated, 300); // Minimum 5 minutes buffer
}

/**
 * Uploads a Blob to Supabase Storage using the REST API.
 * Returns the storage path of the uploaded file.
 */
export async function uploadToSupabase(
  blob: Blob,
  config: SupabaseConfig,
  filePath: string
): Promise<string> {
  const url = `${config.url}/storage/v1/object/${config.bucket}/${filePath}`;

  logger.info(`[Supabase] Uploading to storage`, {
    bucket: config.bucket,
    path: filePath,
    size: `${(blob.size / 1024).toFixed(1)} KB`,
  });

  // Convert Blob to ArrayBuffer for Tauri's fetch
  const arrayBuffer = await blob.arrayBuffer();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      "Content-Type": blob.type || "image/webp",
      "x-upsert": "true", // Overwrite if file already exists
    },
    body: new Uint8Array(arrayBuffer),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => response.statusText);
    throw new Error(
      `[Supabase] Upload failed (${response.status}): ${errBody}`
    );
  }

  logger.debug(`[Supabase] Upload successful`, { path: filePath });
  return filePath;
}

/**
 * Generates a signed URL for a file in Supabase private Storage.
 * The URL will be valid for the specified TTL in seconds.
 */
export async function getSignedUrl(
  filePath: string,
  config: SupabaseConfig,
  ttlSeconds: number
): Promise<string> {
  const url = `${config.url}/storage/v1/object/sign/${config.bucket}/${filePath}`;

  logger.debug(`[Supabase] Generating signed URL`, {
    path: filePath,
    ttl: `${ttlSeconds}s`,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: ttlSeconds }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => response.statusText);
    throw new Error(
      `[Supabase] Signed URL generation failed (${response.status}): ${errBody}`
    );
  }

  const data = await response.json();

  // Supabase returns { signedURL: "/storage/v1/object/sign/..." }
  // Sometimes it might omit the /storage/v1 prefix depending on the environment
  const signedPath: string = data.signedURL ?? data.signedUrl;
  
  if (!signedPath) {
    logger.error("[Supabase] Signed URL response missing path data", { response: data });
    throw new Error("[Supabase] No signedURL in response");
  }

  // Ensure the path is prefixed with /storage/v1 if it's a relative path
  let normalizedPath = signedPath;
  if (!normalizedPath.startsWith("http") && !normalizedPath.startsWith("/storage/v1")) {
    normalizedPath = normalizedPath.startsWith("/") 
      ? `/storage/v1${normalizedPath}` 
      : `/storage/v1/${normalizedPath}`;
    
    logger.debug(`[Supabase] Normalized signed path`, { original: signedPath, normalized: normalizedPath });
  }

  // Ensure config.url doesn't have a trailing slash before appending normalizedPath
  const baseUrl = config.url.replace(/\/$/, "");
  const fullUrl = normalizedPath.startsWith("http")
    ? normalizedPath
    : `${baseUrl}${normalizedPath}`;

  logger.debug(`[Supabase] Signed URL generated`, { 
    path: filePath,
    url: fullUrl.split("?")[0] + "?[token]" // Log without full token for security
  });
  
  return fullUrl;
}

/**
 * Deletes a file from Supabase Storage.
 * Should be called in a finally block after extraction to ensure cleanup.
 */
export async function deleteFromSupabase(
  filePath: string,
  config: SupabaseConfig
): Promise<void> {
  const url = `${config.url}/storage/v1/object/${config.bucket}`;

  logger.debug(`[Supabase] Deleting file`, {
    bucket: config.bucket,
    path: filePath,
  });

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: [filePath] }),
  });

  if (!response.ok) {
    // Log warning but don't throw — deletion failure shouldn't break the result
    const errBody = await response.text().catch(() => response.statusText);
    logger.warn(`[Supabase] Cleanup failed (${response.status}): ${errBody}`, {
      path: filePath,
    });
  } else {
    logger.debug(`[Supabase] File deleted (cleanup complete)`, {
      path: filePath,
    });
  }
}

/**
 * Tests the Supabase connection by attempting to list objects in the bucket.
 * Returns true if the connection is valid, throws an error otherwise.
 */
export async function testSupabaseConnection(
  config: SupabaseConfig
): Promise<{ ok: boolean; message: string }> {
  try {
    const url = `${config.url}/storage/v1/bucket/${config.bucket}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.serviceKey}`,
        apikey: config.serviceKey,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return {
        ok: true,
        message: `Connected to bucket "${data.name}" (${data.public ? "public" : "private"})`,
      };
    }

    if (response.status === 404) {
      return {
        ok: false,
        message: `Bucket "${config.bucket}" not found. Please create it in the Supabase dashboard.`,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message: "Authentication failed. Please check your Service Role Key.",
      };
    }

    return {
      ok: false,
      message: `Connection failed (HTTP ${response.status}). Check your Project URL.`,
    };
  } catch (e: any) {
    return {
      ok: false,
      message: `Network error: ${e.message || String(e)}`,
    };
  }
}

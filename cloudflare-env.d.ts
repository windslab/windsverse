declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    /** One-time code for activating the first owner (a secret, set on the host). */
    OWNER_SETUP_CODE?: string;
  }
}

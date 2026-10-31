export interface D1HttpConfiguration {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_D1_TOKEN: string;
  CLOUDFLARE_DATABASE_ID: string;
}

export interface D1Environment {
  [key: string]: string | undefined;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_DATABASE_ID?: string;
}

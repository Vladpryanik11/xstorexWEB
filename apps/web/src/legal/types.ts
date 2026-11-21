/** A paragraph, a bulleted list, or the support contacts (email and Telegram, from env). */
export type LegalBlock = string | { list: string[] } | { contacts: true };

export type LegalSection = { heading: string; blocks: LegalBlock[] };

export type LegalDoc = {
  title: string;
  /** Shown as «Обновлено …». */
  updated: string;
  intro: string[];
  sections: LegalSection[];
};

/** The date every document shows; bump it with any change of a document. */
export const LEGAL_UPDATED = '21 ноября 2026';

export const supportEmail = () => process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@xstorex.app';

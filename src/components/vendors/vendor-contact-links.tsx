import { instagramUrl, safeExternalUrl, whatsappLink } from "@/lib/vendors";

const CHIP =
  "inline-flex min-h-10 items-center gap-1 rounded-full bg-white px-3 text-sm font-medium text-clay-700 ring-1 ring-cream-300 hover:bg-cream-100";

export type VendorContact = {
  contactPerson: string | null;
  whatsapp: string | null;
  phone: string | null;
  instagram: string | null;
  website: string | null;
};

/** Only verified-safe URLs are rendered as links (wa.me, tel:, instagram.com, http/https). */
export function VendorContactLinks({ contact }: { contact: VendorContact }) {
  const wa = whatsappLink(contact.whatsapp);
  const tel = contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, "")}` : null;
  const ig = instagramUrl(contact.instagram);
  const web = safeExternalUrl(contact.website);

  if (!contact.contactPerson && !wa && !tel && !ig && !web) {
    return <p className="text-sm text-ink-500">Belum ada kontak.</p>;
  }

  return (
    <div className="space-y-2 text-sm">
      {contact.contactPerson ? (
        <p className="text-ink-700">
          Kontak: <strong className="text-ink-900">{contact.contactPerson}</strong>
        </p>
      ) : null}
      <ul className="flex flex-wrap gap-2">
        {wa ? (
          <li>
            <a href={wa} target="_blank" rel="noopener noreferrer" className={CHIP}>
              WhatsApp<span className="sr-only"> {contact.whatsapp}</span>
            </a>
          </li>
        ) : null}
        {tel ? (
          <li>
            <a href={tel} className={CHIP}>
              Telepon {contact.phone}
            </a>
          </li>
        ) : null}
        {ig ? (
          <li>
            <a href={ig} target="_blank" rel="noopener noreferrer" className={CHIP}>
              Instagram @{contact.instagram}
            </a>
          </li>
        ) : null}
        {web ? (
          <li>
            <a href={web} target="_blank" rel="noopener noreferrer" className={CHIP}>
              Website
            </a>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

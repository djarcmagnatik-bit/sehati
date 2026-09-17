import { redirect } from "next/navigation";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { parseProgressCardOptions } from "@/lib/reports";
import { SITE } from "@/lib/site";
import { requireSession } from "@/server/auth/session-cookie";
import { getProgressCard } from "@/server/reports/progress-card-service";
import { getActiveWeddingForUser } from "@/server/wedding/wedding-service";

export const dynamic = "force-dynamic";

const COLORS = { background: "#fdfbf8", surface: "#ffffff", ink: "#2a211d", muted: "#6b5d55", clay: "#9d4f37", sage: "#4c5c43", line: "#efe6dc" };

/** Instagram portrait (4:5). Every combination of sections is laid out to fit inside it. */
const WIDTH = 1080;
const HEIGHT = 1350;

function Section({ title, children, grow = false }: { title: string; children: ReactNode; grow?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexGrow: grow ? 1 : 0,
        flexBasis: grow ? 0 : "auto",
        background: COLORS.surface,
        borderRadius: 32,
        padding: "26px 36px",
        border: `2px solid ${COLORS.line}`,
      }}
    >
      <div style={{ display: "flex", fontSize: 24, color: COLORS.muted, letterSpacing: 2 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>{children}</div>
    </div>
  );
}

function Headline({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", fontSize: 40, fontWeight: 700, lineHeight: 1.15 }}>{children}</div>;
}

function Note({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", fontSize: 28, color: COLORS.muted, marginTop: 6 }}>{children}</div>;
}

function Bar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: "flex", height: 16, borderRadius: 8, background: COLORS.line, marginTop: 16 }}>
      <div style={{ display: "flex", width: `${width}%`, height: 16, borderRadius: 8, background: COLORS.clay }} />
    </div>
  );
}

/** The shareable progress card as a PNG. Private: rendered per request for the signed-in member only. */
export async function GET(request: Request): Promise<Response> {
  const session = await requireSession();
  const membership = await getActiveWeddingForUser(session.user.id);
  if (!membership) redirect("/onboarding");
  const options = parseProgressCardOptions(new URL(request.url).searchParams);
  const card = await getProgressCard(session.user.id, membership.wedding.id, options);

  const guests = card.guests ? (
    <Section title="TAMU" grow>
      <Headline>{`${card.guests.attendingSeats} orang hadir`}</Headline>
      <Note>{`${card.guests.respondedPercent}% dari ${card.guests.invitations} undangan membalas`}</Note>
    </Section>
  ) : null;

  const budget = card.budget ? (
    <Section title="BUDGET" grow>
      <Headline>
        {card.budget.committed && card.budget.target
          ? `${card.budget.committed}`
          : card.budget.usedPercent !== null
            ? `${card.budget.usedPercent}% terpakai`
            : "Target belum diatur"}
      </Headline>
      <Note>
        {card.budget.committed && card.budget.target
          ? `dari target ${card.budget.target}`
          : card.budget.paidPercent !== null
            ? `${card.budget.paidPercent}% sudah dibayar`
            : "Belum ada pengeluaran"}
      </Note>
      {card.budget.usedPercent !== null ? <Bar value={card.budget.usedPercent} /> : null}
    </Section>
  ) : null;

  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: COLORS.background, padding: "60px 64px", color: COLORS.ink, gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="52" height="52" viewBox="0 0 32 32">
            <circle cx="12" cy="17" r="8" fill="none" stroke={COLORS.clay} strokeWidth="2.5" />
            <circle cx="20" cy="15" r="8" fill="none" stroke={COLORS.sage} strokeWidth="2.5" />
          </svg>
          <div style={{ display: "flex", fontSize: 30, color: COLORS.muted }}>{SITE.name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: card.coupleName.length > 24 ? 52 : 68, fontWeight: 700, lineHeight: 1.1 }}>{card.coupleName}</div>
          <div style={{ display: "flex", fontSize: 30, color: COLORS.muted, marginTop: 8 }}>{card.weddingDateLabel}</div>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 18, color: COLORS.clay }}>
          {card.countdownDays !== null ? <div style={{ display: "flex", fontSize: 128, fontWeight: 700, lineHeight: 1 }}>{card.countdownDays}</div> : null}
          <div style={{ display: "flex", fontSize: card.countdownDays !== null ? 36 : 52, fontWeight: 700 }}>
            {card.countdownDays !== null ? "hari menuju hari bahagia" : card.countdownLabel}
          </div>
        </div>

        {card.checklist ? (
          <Section title="PERSIAPAN">
            <Headline>{`${card.checklist.percent}% · ${card.checklist.completed} dari ${card.checklist.total} tugas selesai`}</Headline>
            <Bar value={card.checklist.percent} />
          </Section>
        ) : null}

        {card.nextTasks && card.nextTasks.length > 0 ? (
          <Section title="BERIKUTNYA">
            {card.nextTasks.map((task, index) => (
              <div key={index} style={{ display: "flex", alignItems: "center", fontSize: 30, marginTop: index === 0 ? 0 : 10 }}>
                {/* One line per task: long titles end in an ellipsis instead of running into the date. */}
                <div style={{ display: "flex", flexGrow: 1, flexBasis: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", marginRight: 24 }}>
                  {task.title}
                </div>
                <div style={{ display: "flex", flexShrink: 0, color: COLORS.muted }}>{task.dueLabel}</div>
              </div>
            ))}
          </Section>
        ) : null}

        {guests || budget ? (
          <div style={{ display: "flex", gap: 20 }}>
            {guests}
            {budget}
          </div>
        ) : null}
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );

  const headers = new Headers(image.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", 'inline; filename="sehati-progres.png"');
  return new Response(image.body, { status: image.status, headers });
}

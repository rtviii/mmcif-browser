"use client";
import { useEffect, type ReactNode } from "react";
import { MmcifChip } from "@/components/cif/MmcifChip";
import { useStore } from "@/lib/store";
import { Tok } from "./FigureContext";
import { StageFigure } from "./StageFigure";

// Inline code token for a VALUE (an altloc letter, an enumeration value, a number). Category and
// item names use <Cat> / <It> instead, which carry the dictionary tooltip.
function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.86em] text-slate-700">
      {children}
    </code>
  );
}

// The five categories this page PROPOSES. Everything else it names already exists in PDBx/mmCIF,
// and links out to its published definition — so whether a name is a link is itself the answer to
// "does this exist today, or are you asking for it?", which is the question the page is about.
//
// Hand-maintained, but not on the honour system: check_page.py asserts this set matches the
// categories declared in pipeline/data/mmcif_pdbx_v50_het_ext.dic exactly, so adding a category to
// the fork without listing it here (which would silently produce a 404 link) fails the gate.
const PROPOSED_CATEGORIES = new Set([
  "pdbx_alt_groups",
  "pdbx_heterogeneity_hierarchy",
  "pdbx_state_coexistence",
  "pdbx_occupancy_relationship",
  "pdbx_occupancy_relationship_member",
]);

// The wwPDB's dictionary browser — the published home of the definitions this page borrows. The
// URL is derived from the name, and every one is verified by check_page.py against the base
// dictionary artifact, which is built from the very .dic the browser publishes.
const DICT_URL = "https://mmcif.wwpdb.org/dictionaries/mmcif_pdbx_v50.dic";
const catHref = (cat: string) =>
  PROPOSED_CATEGORIES.has(cat) ? undefined : `${DICT_URL}/Categories/${cat}.html`;
const itemHref = (cat: string, field: string) =>
  PROPOSED_CATEGORIES.has(cat) ? undefined : `${DICT_URL}/Items/_${cat}.${field}.html`;

// Existing names get a pointer cursor and firm up their underline on hover; proposed ones keep the
// help cursor and stay put, because there is nowhere to send you.
const chipClass = (linked: boolean) =>
  `rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.86em] text-slate-700 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:bg-slate-200 hover:text-slate-900 ${
    linked ? "cursor-pointer hover:decoration-solid hover:decoration-slate-500" : "cursor-help"
  }`;

// A category name. Hovering it raises the same dictionary tooltip the Inspector shows, because it
// is the same component reading the same dictionary — this page just loads the variant that has
// the proposed categories in it (see useHetDictionary). If the category already exists, the name
// is also a link to its definition on the wwPDB dictionary browser.
function Cat({ name }: { name: string }) {
  const href = catHref(name);
  return (
    <MmcifChip
      target={{ kind: "category", cat: name }}
      variant="inline"
      href={href}
      className={chipClass(!!href)}
    >
      _{name}
    </MmcifChip>
  );
}

// An item (column) name. Same tooltip; carries type, mandatory-ness and enumerations.
function It({ cat, field, bare }: { cat: string; field: string; bare?: boolean }) {
  const href = itemHref(cat, field);
  return (
    <MmcifChip
      target={{ kind: "item", cat, field }}
      variant="inline"
      href={href}
      className={chipClass(!!href)}
    >
      {bare ? field : `_${cat}.${field}`}
    </MmcifChip>
  );
}

// A genuine aside: true, worth having on the page, not worth interrupting the argument for.
function Aside({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group my-1 rounded border border-slate-200 bg-slate-50/60 px-3 py-1.5">
      <summary className="cursor-pointer list-none text-[12px] text-slate-500 hover:text-slate-700">
        <span className="mr-1.5 inline-block text-[9px] text-slate-400 transition-transform group-open:rotate-90">
          ▶
        </span>
        {summary}
      </summary>
      <div className="mt-2 space-y-2 text-[12.5px] leading-[1.7] text-slate-600">{children}</div>
    </details>
  );
}

// A section spans the article's full width (.bleed) and re-establishes the same content column
// (.doc-grid), so its prose stays aligned with everything else while a <figure> inside it can still
// reach the edges. That is why the children are NOT wrapped in a styling div: a wrapper would be the
// grid child, and the figures inside it could never escape the content column. Body type is set here
// and inherited instead.
function Section({
  id,
  title,
  subtitle,
  tag,
  children,
}: {
  id: string;
  title?: string;
  /** The one-line "what this changes, and what it improves on" under the title. In Part IV every
   *  section carries one, so a reader can tell at a glance which category is on trial and what it
   *  is being compared against. ReactNode, not string, so it can carry live <It> chips. */
  subtitle?: ReactNode;
  tag?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="doc-grid bleed scroll-mt-6 gap-y-3 text-[13.5px] leading-[1.75] text-slate-700"
    >
      {title && (
        <div className="pb-0.5 pt-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">{title}</h2>
            {tag && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700">
                {tag}
              </span>
            )}
          </div>
          {subtitle && <div className="mt-1 text-[11.5px] text-slate-400">{subtitle}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// A part boundary. Parts are the only thing on the page that gets real air: a full-bleed rule, a
// numbered label, and generous space. Sections inside a part run on. Like Section it is a .bleed
// .doc-grid sibling (never a wrapper of the sections), so the sections and figures that follow keep
// their own grid breakout.
function PartDivider({ part, title }: { part?: string; title: string }) {
  return (
    <section className="bleed doc-grid scroll-mt-6 pt-12">
      <div className="bleed border-t border-slate-300" />
      <div className="pt-6">
        {part && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
            Part {part}
          </div>
        )}
        <h2 className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-900">{title}</h2>
      </div>
    </section>
  );
}

// Inline cross-reference to another section, by its id.
function Ref({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={`#${to}`}
      className="underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
    >
      {children}
    </a>
  );
}

// The proposed categories are defined in the "het" dictionary variant, so every tooltip on this
// page needs that variant loaded. Cold entry here loads it directly (set the variant first, so
// init's own fetch gets the right one and still seeds the graph canvas that CifInspector and
// GraphExplorer expect). A reader who arrives from the Inspector gets it swapped and swapped back,
// so their dictionary selector is where they left it.
function useHetDictionary() {
  useEffect(() => {
    const { loaded, variant } = useStore.getState();
    const restoreTo = loaded && variant !== "het" ? variant : null;
    void (async () => {
      if (!useStore.getState().loaded) {
        useStore.setState({ variant: "het" });
        await useStore.getState().init();
      } else {
        await useStore.getState().setVariant("het");
      }
    })();
    return () => {
      if (restoreTo) void useStore.getState().setVariant(restoreTo);
    };
  }, []);
}

// The parts, each grouping the sections underneath it. This is the only place the structure is
// spelled out; both nav render sites and the reading order follow it.
const PARTS: { part?: string; title: string; sections: { id: string; label: string }[] }[] = [
  {
    title: "Prologue",
    sections: [{ id: "inventory", label: "How the PDB encodes heterogeneity today" }],
  },
  {
    part: "I",
    title: "The problem: which alternates go together",
    sections: [{ id: "problem", label: "What the file records, and what it leaves out" }],
  },
  {
    part: "II",
    title: "What mmCIF encodes today",
    sections: [
      { id: "today", label: "The letter and the occupancy" },
      { id: "escalator", label: "Where the two columns run out" },
    ],
  },
  {
    part: "III",
    title: "The proposal",
    sections: [{ id: "categories", label: "The proposed categories" }],
  },
  {
    part: "IV",
    title: "The cases",
    sections: [
      { id: "networks", label: "Explicit state grouping" },
      { id: "subresidue", label: "Membership below the residue" },
      { id: "nesting", label: "Occupancy that nests" },
      { id: "exclusions", label: "Exclusion across branches" },
      { id: "locks", label: "Locking occupancy across branches" },
      { id: "occupancy", label: "The occupancy specification" },
    ],
  },
  {
    part: "V",
    title: "Open problems",
    sections: [{ id: "open", label: "Open problems" }],
  },
  {
    title: "Appendix — the examples",
    sections: [{ id: "examples", label: "The example files" }],
  },
];

export default function ProposalPage() {
  useHetDictionary();

  return (
    <div className="light-surface flex h-full bg-white text-slate-800">
      {/* The contents rail sits OUTSIDE the scroll container, so it needs no sticky positioning and
          takes no part in the figures' breakout: the article's grid resolves against its own width,
          whatever is beside it. Below xl it is replaced by the horizontal strip in the article. */}
      <aside className="no-scrollbar hidden w-[260px] shrink-0 overflow-y-auto border-r border-slate-100 px-5 py-14 xl:block">
        <div className="mb-3 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          contents
        </div>
        <nav className="space-y-5">
          {PARTS.map((p) => (
            <div key={p.title}>
              <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                {p.part ? `${p.part} · ${p.title}` : p.title}
              </div>
              <ol className="space-y-1 text-[12px]">
                {p.sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>
        <details className="mt-8 border-t border-slate-100 pt-4">
          <summary className="cursor-pointer list-none text-[9px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600">
            the examples
          </summary>
          <ExampleGlossary />
        </details>
      </aside>

      <div className="h-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <article className="doc-grid gap-y-6 py-14">
          <header>
            <div className="mb-3 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              PDBx / mmCIF · proposed extension
            </div>
            <h1 className="mb-4 text-[30px] font-semibold leading-tight tracking-tight text-slate-900">
              Encoding structural heterogeneity in mmCIF
            </h1>
            <p className="max-w-[88ch] text-[15px] leading-relaxed text-slate-600">
              A structure is a model of many copies of a molecule, and those copies are not
              identical. A coordinate file records how often each alternate appears, but not which
              alternates appear <em>together</em>. This page states what the format encodes today,
              where that runs out, and an extension that records the missing information without
              adding a column to the coordinate table.
            </p>
            <p className="mt-3 max-w-[88ch] text-[13px] leading-relaxed text-slate-500">
              Every example below is a real mmCIF block: the source on the left, the structure on the
              right. Open a figure to load it, then click anything — a network, a state, an altloc
              letter, or a highlighted term in the example&rsquo;s own description — to select it in
              both. With one labelled exception, the coordinates are taken verbatim from deposited
              entries; see the{" "}
              <a
                href="#examples"
                className="underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
              >
                appendix
              </a>
              .
            </p>
          </header>

          <nav className="border-y border-slate-100 py-4 xl:hidden">
            <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
              contents
            </div>
            <div className="space-y-2.5">
              {PARTS.map((p) => (
                <div key={p.title} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                    {p.part ? `${p.part} · ${p.title}` : p.title}
                  </span>
                  {p.sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="text-[12.5px] text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
                    >
                      {s.label}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </nav>

          {/* ---------------------------------------------------------------- prologue */}

          <Section id="inventory" title="How the PDB encodes heterogeneity today">
            <p>
              Several parts of the PDBx/mmCIF dictionary already record that the copies of a molecule
              differ from one another. They are listed here as a plain inventory, because the
              extension proposed below adds to them and replaces none of them.
            </p>
            <MethodsInventory />
            <p>
              The first of these carries the everyday case, and it is what the rest of this document
              is about. The question is what those two columns can and cannot say.
            </p>
          </Section>

          <PartDivider part="I" title="The problem: which alternates go together" />

          <Section id="problem" title="What the file records, and what it leaves out">
            <p>
              A coordinate file describes an average over many copies of a molecule. (An X-ray
              structure is an average because diffraction measures every copy in the crystal at once,
              but what follows is about what the file can write down, not about how the data were
              collected.) Two per-atom columns carry the heterogeneity:{" "}
              <It cat="atom_site" field="label_alt_id" /> says which alternate an atom belongs to,
              and <It cat="atom_site" field="occupancy" /> says in what fraction of the copies it is
              present.
            </p>
            <p>
              Both describe one item at a time: how often it appears, on its own. Neither says which
              alternates appear in the <em>same</em> copy. That is the missing quantity, and the
              whole of this document follows from it.
            </p>
            <p>
              Two adjacent sites make the gap concrete. The top site holds one of two occupants, and
              the bottom site holds one of two others; each of the four is present in half the
              copies. Three physically different crystals then produce a byte-for-byte identical
              file:
            </p>
            <ThreeAnswers />
            <p>
              Each table counts, out of 100 copies, how often a pair of occupants is found together.
              The numbers along the edges — how often each occupant appears at all — are what the
              file records, and they are identical in all three. The interiors are completely
              different, and the interior is what the file has no way to write down. In the first,
              the two sites are filled independently; in the second, they always go together; in the
              third, they never do.
            </p>
            <p>
              The altloc letter cannot recover the difference, because what it guarantees is local:
              within a small region, alternate A goes with A and never with B. It says nothing about
              whether A at one residue and A two hundred residues away are the same physical state —
              and, as <Ref to="today">the deposited file in Part II</Ref> shows, two neighbouring
              parts of one structure routinely use different letters for the same thing.
            </p>
          </Section>

          <PartDivider part="II" title="What mmCIF encodes today" />

          <Section id="today" title="The letter and the occupancy">
            <p>
              A coordinate file is a spine of cross-references: a few small categories declare what
              the molecule is, and one large category, <Cat name="atom_site" />, holds the
              coordinates and points back at them through shared keys. Below is a complete, valid
              file for three residues of crambin, with no heterogeneity in it at all — every atom is
              fully present, at occupancy 1.00 and with no alternate-location letter.
            </p>
            <StageFigure
              id="1EJG_minimal"
              fileUrl="/examples/het/1EJG_minimal.cif"
              view={{ representation: "ball-and-stick", colorTheme: "element-symbol" }}
              height="440px"
              codeTitle="1EJG_minimal — a complete file, no heterogeneity"
              brief={
                <p>
                  Crambin (PDB 1EJG, 0.54 Å), residues{" "}
                  <Tok res="A/14-16">Asn14–Val15–Cys16</Tok> of chain A. Each row of{" "}
                  <C>_atom_site</C> is one atom on the right; each atom is present in every copy, so
                  every <C>occupancy</C> is <C>1.00</C> and every <C>label_alt_id</C> is <C>.</C> —
                  the null value. There is nothing here to select, and no control strip below,
                  because the file describes only one state.
                </p>
              }
              caption="The atoms on the right are exactly the rows of the _atom_site loop on the left."
            />
            <p>
              Heterogeneity enters through the two columns. Here one arginine side chain is modelled
              in two positions, <C>A</C> at 0.67 and <C>B</C> at 0.33, summing to one within the
              residue. Its backbone carries no letter at all: it is single-conformer and shared by
              both alternatives.
            </p>
            <StageFigure
              id="1EJG_rotamer"
              fileUrl="/examples/het/1EJG_rotamer.cif"
              view={{ representation: "ball-and-stick", colorTheme: "alt-loc" }}
              height="440px"
              codeTitle="1EJG_rotamer — one residue, two rotamers"
              brief={
                <>
                  <p>
                    Crambin (PDB 1EJG), residues <Tok res="A/9-11">Ala9–Arg10–Ser11</Tok> of chain A.
                    The guanidinium group of <Tok res="A/10">Arg10</Tok> is modelled in two
                    positions: <Tok altloc="A">alternate A at 0.67</Tok> and{" "}
                    <Tok altloc="B">alternate B at 0.33</Tok>. Select either to see which atoms it
                    claims.
                  </p>
                  <p>
                    The rest of the residue — <Tok atom="A/10/N">N</Tok>,{" "}
                    <Tok atom="A/10/CA">CA</Tok>, <Tok atom="A/10/C">C</Tok>,{" "}
                    <Tok atom="A/10/O">O</Tok>, and the first half of the side chain — carries no
                    letter: it is single-conformer and shared, as are both neighbours. Everything the
                    two alternatives relate sits inside one residue, and their occupancies sum to one
                    there. Today&rsquo;s dictionary handles this case completely.
                  </p>
                </>
              }
            />
            <p>
              Two further pieces of the existing format matter later.{" "}
              <Cat name="struct_conn" />, the sparse bond table, records the connections that a
              template cannot supply — disulfides, links, metal coordination. Each partner is named
              by a full atom key that includes the altloc letter (
              <It cat="struct_conn" field="pdbx_ptnr1_label_alt_id" bare />,{" "}
              <It cat="struct_conn" field="pdbx_ptnr2_label_alt_id" bare />
              ), so a bond can belong to one alternate and not another. And there is a legacy
              mechanism for grouping the letters, which is dormant in practice:
            </p>
            <Aside summary="_atom_sites_alt — the existing grouping mechanism, and why it is not enough">
              <p>
                <Cat name="atom_sites_alt" /> names altloc letters and describes them, and{" "}
                <Cat name="atom_sites_alt_ens" /> with <Cat name="atom_sites_alt_gen" /> collects
                them into ensembles. So the dictionary has had a place to group alternates for a long
                time.
              </p>
              <p>
                It is not used for the problem described here, and it could not be. The grouping is
                global — a letter is named once for the whole file, with no residue scoping — so it
                inherits the overloaded-letter problem shown below rather than solving it. It carries
                no parent/child relation between alternates, and no occupancy semantics. The
                extension proposed here supersedes it.
              </p>
            </Aside>
            <p>
              The mechanism above works because everything it relates sits inside one residue. It
              stops working as soon as a relationship spans more than one.
            </p>
            <p>
              The file below is the calcium site of calmodulin, exactly as deposited. Two stretches
              of the chain run through it, and each is modelled in several alternates. Residues 20–24
              have <em>two</em>, lettered B and D. Residues 25–31 have <em>four</em>, lettered A, B,
              C and D. Each set sums to 1.00, so each is one occupancy group in the ordinary sense.
              Both stretches coordinate the same calcium ion, so they are physically coupled.
            </p>
            <p>
              Nothing in the file says so, and the letters do not line up. Select a letter under the
              viewer: B and D each light up in <em>both</em> stretches, while A and C exist only in
              the second one. Nothing states whether &ldquo;B&rdquo; at residue 20 is the same
              physical state as &ldquo;B&rdquo; at residue 26 — and a reader who assumes that
              matching letters mean matching states will be wrong. This is the file as it exists
              today: <Cat name="atom_site" /> and nothing else.
            </p>
            <StageFigure
              id="5E1N_ca_site-deposited"
              fileUrl="/examples/het/5E1N_ca_site.cif"
              view={{ representation: "ball-and-stick", colorTheme: "alt-loc" }}
              het={false}
              truncateBefore="_pdbx_alt_groups"
              codeTitle="5E1N_ca_site — as deposited, no annotation"
              brief={
                <>
                  <p>
                    Calmodulin (PDB 5E1N, atomic resolution), the EF-hand loop around calcium ion 203:
                    residues <Tok res="A/20-31">20–31</Tok> of chain A, the ion, and its coordinating
                    water. Two multi-residue alternates run through the loop:{" "}
                    <Tok res="A/20-24">residues 20–24</Tok> are modelled in two alternates, lettered{" "}
                    <Tok altloc="B">B</Tok> and <Tok altloc="D">D</Tok>;{" "}
                    <Tok res="A/25-31">residues 25–31</Tok> in four, lettered <Tok altloc="A">A</Tok>,{" "}
                    <Tok altloc="B">B</Tok>, <Tok altloc="C">C</Tok> and <Tok altloc="D">D</Tok>.
                  </p>
                  <p>
                    Each set sums to 1.00 within its own stretch. But the two sets do not use the same
                    letters, and the file does not say whether the letters they share mean the same
                    thing. The correlation is real — both stretches coordinate the same ion — and it
                    is unwritten. This is the same file that{" "}
                    <Ref to="networks">explicit state grouping</Ref> annotates; the atoms do not
                    change.
                  </p>
                </>
              }
              caption="PDB 5E1N, the EF-hand loop around calcium 203, coloured by altloc letter. Two coupled stretches, two different letter sets, and no record of which alternate goes with which."
            />
          </Section>

          <Section id="escalator" title="Where the two columns run out">
            <p>
              Seven cases, in increasing order of difficulty. The first is handled completely by
              what exists today; each one after it asks for something the letter and the occupancy
              cannot supply, and the last is beyond this proposal too.
            </p>
            <Escalator />
          </Section>

          <PartDivider part="III" title="The proposal" />

          <Section id="categories" title="The proposed categories">
            <p>
              The extension is four optional categories. They point <em>into</em>{" "}
              <Cat name="atom_site" /> through the keys it already has and add no column to it, so a
              program that does not know them reads exactly the coordinates it reads today. Each is
              applied to a real case in <Ref to="networks">Part IV</Ref>.
            </p>
            <CategoryReference />
            <p>
              Two reading rules tie them together. First, alternatives that share a{" "}
              <It cat="pdbx_heterogeneity_hierarchy" field="coexistence_group_id" bare /> are
              mutually exclusive, and that exclusivity is inherited by their descendants — which is
              why an explicit exclusion list is needed only when networks in different branches
              clash. Second, the always-present single-conformer part of the structure is the
              implicit root network, <C>base</C>: occupancy 1, the root of the tree, carrying no
              membership rows because its atoms are simply everything that no other network claims.
              Only alternates are ever listed.
            </p>
          </Section>

          <PartDivider part="IV" title="The cases" />

          <Section
            id="networks"
            title="Explicit state grouping"
            subtitle={
              <>
                Improves on: <It cat="atom_site" field="label_alt_id" /> — a letter that only groups
                atoms by coincidence
              </>
            }
          >
            <p>
              The deposited file from <Ref to="today">Part II</Ref> has the letter <C>B</C> in two
              stretches of one chain, and nothing in it says whether those two <C>B</C>s are the same
              physical state or two unrelated choices that happen to share a letter. A reader has to
              guess from the occupancies. Two small side tables remove the guess.
            </p>
            <p>
              <Cat name="pdbx_alt_groups" /> gives the state a <em>name</em> and says which atoms
              carry it — by chain, residue range and altloc letter. Because a name can be repeated
              across rows, one name can span a whole stretch of the chain, which a letter cannot do:
              a letter is scoped to the residue it sits in.{" "}
              <Cat name="pdbx_heterogeneity_hierarchy" /> then puts each name in a coexistence group,
              the set of states that exclude one another — which is what a crystallographer already
              calls an occupancy group.
            </p>
            <p>
              Below, the two stretches become six named networks in two such groups. The correlation
              that was previously only implied by the numbers is now written down, and the letter is
              relieved of a job it was never able to do. No atom changes; the two tables are additive.
            </p>
            <StageFigure
              id="5E1N_ca_site"
              fileUrl="/examples/het/5E1N_ca_site.cif"
              het
              codeTitle="5E1N_ca_site — annotated: 6 networks in 2 occupancy groups"
              brief={
                <>
                  <p>
                    The same deposited atoms as the unannotated figure above. The first stretch
                    becomes two networks, <Tok net="seg1_B">seg1_B</Tok> and{" "}
                    <Tok net="seg1_D">seg1_D</Tok>, sharing the coexistence group{" "}
                    <C>entry_loop</C>; the second becomes four — <Tok net="seg2_A">seg2_A</Tok>,{" "}
                    <Tok net="seg2_B">seg2_B</Tok>, <Tok net="seg2_C">seg2_C</Tok>,{" "}
                    <Tok net="seg2_D">seg2_D</Tok> — sharing <C>exit_loop</C>. Each name now says
                    which stretch it belongs to, so the letter no longer has to carry that by
                    coincidence.
                  </p>
                  <p>
                    The grouping is taken from a prototype annotation of 5E1N, clipped to the carved
                    residue window.
                  </p>
                  <p>
                    The file also carries <Cat name="struct_conn" />, the standard category that
                    records which atoms are chemically bonded — here, the bonds from the calcium ion
                    to the oxygens that coordinate it. These are <em>alternate-specific</em>:
                    Thr26&rsquo;s carbonyl oxygen reaches the ion at 2.33, 2.45, 2.65 and 2.10 Å in
                    alternates A, B, C and D, and each of those four contacts is recorded as its own
                    bond against its own letter. It is worth noticing how it points at those atoms —
                    by chain, residue, atom name <em>and</em> altloc, through{" "}
                    <It cat="struct_conn" field="pdbx_ptnr1_label_alt_id" />. That is the same key{" "}
                    <Cat name="pdbx_alt_groups" /> uses, and it is already in the dictionary: naming
                    alternates by pointing into <Cat name="atom_site" /> is an established move, not
                    one this proposal invents.
                  </p>
                </>
              }
              caption="The same deposited atoms, now annotated. Click a network to highlight the rows that define it."
            />
          </Section>

          <Section
            id="subresidue"
            title="Membership below the residue"
            subtitle={
              <>
                Improves on: <It cat="atom_site" field="label_alt_id" />, which cannot split a
                residue — and reaches the same cases as a per-atom column, without adding one
              </>
            }
          >
            <p>
              A residue-range key is enough almost everywhere, but not everywhere. A network boundary
              can fall <em>inside</em> a residue, and then the key fails.
            </p>
            <p>
              In the file below, Gln8 carries two independent choices at once. Its backbone amide
              hydrogen follows the conformation of the <em>preceding</em> residues — the N–H points
              back at the previous carbonyl — so it belongs with residues 6–7. Its side chain is its
              own rotamer, in a separate occupancy group with different occupancies. And both choices
              use the same letters: the atoms of Gln8 with <C>label_alt_id</C> = <C>A</C> belong to
              two different networks. A key of (chain, residue range, altloc) cannot separate them;
              both are &ldquo;chain A, residue 8, alternate A&rdquo;.
            </p>
            <p>
              The optional <It cat="pdbx_alt_groups" field="label_atom_id" /> is the escape hatch:
              when a membership row names an atom, it claims exactly that atom and nothing else. A
              membership table with it is precisely as expressive as a per-atom state label, with{" "}
              <Cat name="atom_site" /> left alone.
            </p>
            <StageFigure
              id="5E1N_gln8_split"
              fileUrl="/examples/het/5E1N_gln8_split.cif"
              het
              codeTitle="5E1N_gln8_split — label_atom_id splits a residue below the letter"
              brief={
                <>
                  <p>
                    Calmodulin (PDB 5E1N), residues <Tok res="A/6-8">Glu6–Glu7–Gln8</Tok>. Hydrogens
                    are omitted except <Tok atom="A/8/H">Gln8&rsquo;s amide H</Tok>, which is the atom
                    in question.
                  </p>
                  <p>
                    The amide H follows the residues 6–7 backbone, in three alternates:{" "}
                    <Tok net="bb_A">bb_A</Tok>, <Tok net="bb_B">bb_B</Tok>,{" "}
                    <Tok net="bb_C">bb_C</Tok>. The side chain (CB, CG, CD, OE1, NE2) is its own
                    rotamer in two: <Tok net="sc_A">sc_A</Tok> and <Tok net="sc_B">sc_B</Tok>. Select{" "}
                    <Tok net="bb_A">bb_A</Tok> and then <Tok net="sc_A">sc_A</Tok>: both claim atoms
                    of residue 8 lettered <C>A</C>, and they are different networks with different
                    occupancies. The membership rows tell them apart only because each names its
                    atoms.
                  </p>
                </>
              }
              caption="PDB 5E1N, residues 6–8. The same letter, in one residue, meaning two different things."
            />
            <Aside summary="Why not simply add a column to _atom_site?">
              <p>
                The same information can be carried by adding one column to the coordinate table — a
                per-atom token naming the group each atom belongs to. A prototype annotation of 5E1N
                does exactly that, and it separates this case effortlessly, because every atom names
                its own group and nothing has to be inferred from a key. The case is not rare: in
                that file there are 28 (chain, residue, altloc) triples whose atoms fall in two
                different groups.
              </p>
              <p>
                <It cat="pdbx_alt_groups" field="label_atom_id" /> reaches all 28 without touching{" "}
                <Cat name="atom_site" />, at a cost of 28 extra rows in a side table. That is the
                reason the proposal takes this route: a new column on the coordinate table is read by
                every program that parses coordinates, on every file, including the overwhelming
                majority that carry no heterogeneity annotation at all — whereas a side table is read
                only by the programs that want it.
              </p>
            </Aside>
          </Section>

          <Section
            id="nesting"
            title="Occupancy that nests"
            subtitle={
              <>
                Improves on: the flat occupancy group, which can only say &ldquo;these sum to
                one&rdquo;
              </>
            }
          >
            <p>
              An occupancy group is a flat thing: a set of alternatives that sum to one. But a choice
              can exist only <em>inside</em> another choice — you cannot pick which way a ligand is
              posed in the copies where the ligand is not there at all. A flat group cannot say that,
              because the inner alternatives do not sum to one; they sum to however often the outer
              choice happened.
            </p>
            <p>
              The file below is a fragment-screening entry. Its binding pocket is modelled in two
              conformations, apo at 0.78 and bound at 0.22, and the ligand is modelled in two
              mutually exclusive poses at 0.13 and 0.09. Those numbers are deposited, and the
              arithmetic is the whole argument:
            </p>
            <Equation>0.13 + 0.09 = 0.22 = occupancy(bound)</Equation>
            <p>
              Two columns carry this.{" "}
              <It cat="pdbx_heterogeneity_hierarchy" field="parent_alt_groups_id" bare /> names{" "}
              <C>bound</C> as the poses&rsquo; parent, and{" "}
              <It cat="pdbx_heterogeneity_hierarchy" field="occupancy_completeness" bare /> set to{" "}
              <C>complete</C> says the group sums to that parent rather than to one. Two consequences
              follow from the parent link alone, with nothing else written down. A pose can never
              co-occur with apo, because reaching a pose means passing through <C>bound</C>, and{" "}
              <C>bound</C> and <C>apo</C> are in one coexistence group — so{" "}
              <Cat name="pdbx_state_coexistence" /> stays empty here. And the ligand&rsquo;s{" "}
              <em>absence</em>, the 78% of copies in which it has no atoms at all, finally has a name:
              the <C>apo</C> node. A state with no atoms cannot be labelled by any per-atom
              mechanism — there is no atom to put the label on — but a node in a tree carries it
              without difficulty.
            </p>
            <StageFigure
              id="7HHS_apo_bound"
              fileUrl="/examples/het/7HHS_apo_bound.cif"
              het
              codeTitle="7HHS_apo_bound — a nested tree: apo / bound → pose_1, pose_2"
              brief={
                <>
                  <p>
                    Fragment-screening entry PDB 7HHS: the ligand pocket —{" "}
                    <Tok res="A/21-25">residues 21–25</Tok> and{" "}
                    <Tok res="A/47-49">residues 47–49</Tok> of chain A — plus both modelled poses of
                    ligand A1A7O. The pocket is modelled in two conformations,{" "}
                    <Tok net="apo">apo at 0.78</Tok> and <Tok net="bound">bound at 0.22</Tok>, which
                    share one occupancy group under <C>base</C>.
                  </p>
                  <p>
                    The ligand is modelled twice, as two mutually exclusive poses that occupy the same
                    space — their closest atoms are 0.02 Å apart, so they cannot both be there:{" "}
                    <Tok net="pose_1">pose_1 at 0.13</Tok> on residue 201 and{" "}
                    <Tok net="pose_2">pose_2 at 0.09</Tok> on residue 202. They share a second
                    occupancy group whose <em>parent</em> is <Tok net="bound">bound</Tok>, which is
                    what makes 0.13 + 0.09 sum to 0.22 rather than to 1.
                  </p>
                  <p>
                    Note also that the ligand&rsquo;s letters (B, C) do not line up with the
                    pocket&rsquo;s (A, B). &ldquo;B&rdquo; on residue 201 and &ldquo;B&rdquo; on
                    residue 22 are different physical states that happen to share a letter — the same
                    local-letter problem as in Part II, in a second entry.
                  </p>
                </>
              }
              caption="PDB 7HHS. Three legal whole-molecule states: apo (0.78), bound + pose_1 (0.13), bound + pose_2 (0.09). The nesting forbids the rest."
            />
            <p>
              Which network is the parent is a <em>choice</em>, and getting it wrong is the easiest
              way to misuse the hierarchy — the file stays syntactically valid and starts lying. The
              two figures below are the same forty atoms with the same occupancies, and differ in one
              column.
            </p>
            <p>
              A ligand or a glycol sits in a top pocket at 0.50 each; a second glycol sits in a bottom
              pocket at 0.30, or a third at 0.20. Write both pockets as children of <C>base</C> and
              the tree says they vary independently, so the states below the viewer are every
              combination of the two — including <Tok net="Ligand">Ligand</Tok> together with{" "}
              <Tok net="EDO2">EDO2</Tok>. But the bottom pocket sums to 0.50, which is exactly{" "}
              <Tok net="EDO1">EDO1</Tok>&rsquo;s occupancy, and that is the arithmetic of{" "}
              <Ref to="nesting">nesting</Ref>: the bottom pocket is filled precisely when EDO1 is on
              top. The file contradicts its own numbers.
            </p>
            <StageFigure
              id="constructed_two_pocket_flat"
              fileUrl="/examples/het/constructed_two_pocket_flat.cif"
              het
              codeTitle="constructed_two_pocket_flat — both pockets parented to base"
              brief={
                <>
                  <p>
                    <strong className="font-semibold text-slate-700">Constructed.</strong> A real 1EJG
                    tripeptide; the occupants are built to their correct internal geometry and seated
                    against it. The top pocket, <Tok res="A/501">residue 501</Tok>, holds{" "}
                    <Tok net="Ligand">Ligand at 0.50</Tok> or <Tok net="EDO1">EDO1 at 0.50</Tok>. The
                    bottom pocket, <Tok res="A/502">residue 502</Tok>, holds{" "}
                    <Tok net="EDO2">EDO2 at 0.30</Tok> or <Tok net="EDO3">EDO3 at 0.20</Tok>.
                  </p>
                  <p>
                    Every network here names <C>base</C> as its parent, so the bottom pocket has to
                    call itself <C>incomplete</C> — it sums to 0.50 against a parent of 1.0, and the
                    file offers no account of the missing half. Read the state list: it contains{" "}
                    <Tok net="Ligand">Ligand</Tok> with <Tok net="EDO2">EDO2</Tok>, a state the
                    occupancies rule out.
                  </p>
                </>
              }
              caption="The wrong parent. Nothing is malformed — the tree simply claims an independence the numbers deny."
            />
            <p>
              The fix is one column. Name <Tok net="EDO1">EDO1</Tok> as the bottom pocket&rsquo;s
              parent instead of <C>base</C>, and the group becomes <C>complete</C>: it sums to its
              parent, 0.30 + 0.20 = 0.50 = O(EDO1). The false states disappear on their own, because
              reaching EDO2 now means passing through EDO1, and EDO1 excludes Ligand. This is the
              7HHS tree above, with different names.
            </p>
            <StageFigure
              id="constructed_two_pocket"
              fileUrl="/examples/het/constructed_two_pocket.cif"
              het
              codeTitle="constructed_two_pocket — the bottom pocket nested under EDO1"
              brief={
                <>
                  <p>
                    <strong className="font-semibold text-slate-700">Constructed.</strong> Byte for
                    byte the same atoms as the figure above. The only change is in{" "}
                    <Cat name="pdbx_heterogeneity_hierarchy" />:{" "}
                    <It cat="pdbx_heterogeneity_hierarchy" field="parent_alt_groups_id" bare /> reads{" "}
                    <C>EDO1</C> instead of <C>base</C> on <Tok net="EDO2">EDO2</Tok> and{" "}
                    <Tok net="EDO3">EDO3</Tok>, and{" "}
                    <It cat="pdbx_heterogeneity_hierarchy" field="occupancy_completeness" bare />{" "}
                    reads <C>complete</C> instead of <C>incomplete</C>.
                  </p>
                  <p>
                    Three states remain, which is the right number:{" "}
                    <Tok net="Ligand">Ligand</Tok> at 0.50, <Tok net="EDO1">EDO1</Tok> +{" "}
                    <Tok net="EDO2">EDO2</Tok> at 0.30, <Tok net="EDO1">EDO1</Tok> +{" "}
                    <Tok net="EDO3">EDO3</Tok> at 0.20. No exclusion row and no occupancy relationship
                    were needed — the parent link is doing all of it.
                  </p>
                </>
              }
              caption="The same atoms, one column different. The coupling is not recorded anywhere; it follows from the shape of the tree."
            />
          </Section>

          <Section
            id="exclusions"
            title="Exclusion across branches"
            subtitle={
              <>
                New: no existing category can say that two alternates must not co-occur
              </>
            }
          >
            <p>
              Everything so far gets its exclusivity from structure: alternates in one coexistence
              group rule each other out because that is what the group means, and a nested child
              inherits its parent&rsquo;s exclusions. Neither mechanism reaches across the tree. Two
              networks in different branches can be physically incompatible while the tree, quite
              correctly, implies nothing about them at all — and there is no column in mmCIF today
              that records the incompatibility. That gap is the one thing{" "}
              <Cat name="pdbx_state_coexistence" /> exists for.
            </p>
            <p>
              Below, an arginine side chain is modelled in three alternates and a nearby water at
              partial occupancy. They live in different branches — one is a rotamer, the other a
              solvent site — so nothing in the hierarchy forbids them co-occurring. But in alternate
              B the guanidinium nitrogen lands 2.14 Å from the water: not a hydrogen bond, a clash.
              One <C>NOT</C> row records it.
            </p>
            <p>
              This is the only exclusion in the whole of the prototype annotation of 5E1N, which is
              the argument for keeping the category optional, sparse, and <C>NOT</C>-only.{" "}
              <C>AND</C> and <C>OR</C> were deliberately left out: they admit several readings.
            </p>
            <StageFigure
              id="5E1N_arg74_clash"
              fileUrl="/examples/het/5E1N_arg74_clash.cif"
              het
              height="520px"
              codeTitle="5E1N_arg74_clash — one explicit NOT row, the cross-branch clash"
              brief={
                <>
                  <p>
                    Calmodulin (PDB 5E1N), <Tok res="A/74">Arg74</Tok> and its neighbours, plus{" "}
                    <Tok res="A/468">water 468</Tok>. The arginine is modelled in three alternates —{" "}
                    <Tok net="arg74_B">arg74_B</Tok>, <Tok net="arg74_C">arg74_C</Tok>,{" "}
                    <Tok net="arg74_D">arg74_D</Tok> — and the water sits at partial occupancy as{" "}
                    <Tok net="wat468_E">wat468_E</Tok>.
                  </p>
                  <p>
                    Alternates <Tok net="arg74_C">C</Tok> and <Tok net="arg74_D">D</Tok> clear the
                    water by 3.97 and 4.80 Å. Only <Tok net="arg74_B">B</Tok> collides, at 2.14 Å.
                    The exclusion is specific to one alternate, which is exactly why it cannot be
                    inferred from the tree: the rotamer and the solvent site are not siblings, and no
                    occupancy group relates them.
                  </p>
                </>
              }
              caption="PDB 5E1N, Arg74 and water 468. The one real NOT in the file."
            />
            <p>
              One caveat, and it is a cost rather than a claim. A <C>NOT</C> row is not the only
              annotation that points at alternates: <Cat name="struct_conn" /> does too, as the
              calcium site in <Ref to="networks">the first case</Ref> shows — each metal bond names
              the letter it belongs to. So a depositor annotating that entry maintains two independent
              sets of pointers into <Cat name="atom_site" />, the membership rows and the bond
              records, and nothing checks them against each other. Renumber a residue and both must
              move. This proposal does not fix that; it inherits it.
            </p>
          </Section>

          <Section
            id="locks"
            title="Locking occupancy across branches"
            subtitle={
              <>
                New: <Cat name="pdbx_occupancy_relationship" /> — for a tie between two networks that
                no parent link relates
              </>
            }
          >
            <p>
              Every tie so far has run between a network and its own parent, and the parent link plus{" "}
              <It cat="pdbx_heterogeneity_hierarchy" field="occupancy_completeness" bare /> has
              carried it. One kind does not fit that shape. Two sites can be held to the{" "}
              <em>same</em> occupancy while sitting in different branches, with neither one inside the
              other — most commonly when two NCS-related copies of a partial ligand are restrained to
              refine together. There is no parent to hang it on: neither copy contains the other, and
              they share no coexistence group. The hierarchy has nothing to say, and it is right not
              to.
            </p>
            <p>
              This is the one case that needs a category of its own, and it is deliberately small.{" "}
              <Cat name="pdbx_occupancy_relationship" /> is a tie between named networks, written as
              data rather than arithmetic: a head row gives the tie&rsquo;s{" "}
              <It cat="pdbx_occupancy_relationship" field="type" bare /> and its{" "}
              <It cat="pdbx_occupancy_relationship" field="target" bare />, and{" "}
              <Cat name="pdbx_occupancy_relationship_member" /> lists the networks on the other side,
              one per row. The member list is a separate table only because an mmCIF field has to hold
              a single value — a tie over three networks cannot be a comma-separated cell. There are
              two types and no others:
            </p>
            <RelationshipTypes />
            <p>
              Note what <C>sum_to</C> is <em>not</em> for. A set of alternatives summing to their own
              parent is the ordinary nested case from <Ref to="nesting">the previous section</Ref>,
              and it is already said by the parent link — writing it again here would be redundant,
              and the dictionary says so. <C>sum_to</C> is for a sum whose target is somewhere else in
              the tree. In practice almost every real tie is <C>equal</C>.
            </p>
            <p>
              The third column is the one that makes this portable rather than decorative.{" "}
              <It cat="pdbx_occupancy_relationship" field="enforced" bare /> records{" "}
              <em>who made the relation true</em> — whether a program held the numbers to it, or the
              depositor is asserting it after the fact. That distinction is invisible in the
              coordinates: two files whose occupancies happen to match look identical to one where a
              refinement program was forbidden to let them drift. Three values carry it:{" "}
              <C>constraint</C>, a hard constraint during refinement, so the numbers could not have
              come out otherwise; <C>restraint</C>, a soft one with a sigma, so they were pulled
              toward it; and <C>annotation</C>, meaning no program fit it at all and the depositor is
              recording the relation so a later one can act on it.
            </p>
            <p>
              The file below uses <C>annotation</C>, and honestly so — as does every relationship row
              in this repository. That is not a limitation of the encoding but of the field: no
              mainstream refinement program can tie occupancies across two NCS copies of a partial
              ligand today. Which is also why the example is constructed. The tie is exactly the thing
              deposition discards, so no deposited file can carry it; what a real entry leaves behind
              is two copies at suspiciously identical occupancy, and a reader with no way to know
              whether that was intended or a coincidence.
            </p>
            <StageFigure
              id="constructed_ncs_lock"
              fileUrl="/examples/het/constructed_ncs_lock.cif"
              het
              codeTitle="constructed_ncs_lock — one equal row, the cross-branch lock"
              brief={
                <>
                  <p>
                    <strong className="font-semibold text-slate-700">Constructed.</strong> Two copies
                    of a real 1EJG tripeptide, related by a proper NCS operator — a two-fold, then a
                    16 Å translation — so chain B is geometrically identical to chain A. Each carries
                    one ethylene glycol, built to its correct internal geometry, in the equivalent
                    site: <Tok net="edo_A">edo_A at 0.40</Tok> and <Tok net="edo_B">edo_B at 0.40</Tok>
                    .
                  </p>
                  <p>
                    Each glycol is a lone partial network — no modelled alternative sits opposite it —
                    so its{" "}
                    <It cat="pdbx_heterogeneity_hierarchy" field="occupancy_completeness" bare /> is{" "}
                    <C>single</C>: present in 40% of copies, with nothing to sum against. They sit in
                    different coexistence groups, both directly under <C>base</C>. Nothing in the tree
                    connects them, which is the point.
                  </p>
                  <p>
                    The tie is the one row at the foot of the block:{" "}
                    <It cat="pdbx_occupancy_relationship" field="type" bare /> <C>equal</C>,{" "}
                    <It cat="pdbx_occupancy_relationship" field="target" bare /> <C>edo_A</C>, one
                    member row naming <C>edo_B</C>. Read it as O(edo_B) = O(edo_A). No coefficients,
                    no equation — two names and a type.
                  </p>
                  <p>
                    One thing it does <em>not</em> say, and the state list below the viewer is the
                    proof: the four combinations are all still there, including one glycol without the
                    other. That is correct. The tie fixes the two <em>numbers</em> to each other — it
                    is a statement about what refinement was allowed to do — and says nothing about
                    whether the two sites fill together. Two sites can each be 40% occupied and be
                    entirely unrelated. Co-occurrence is what a coexistence group and the tree are
                    for, and neither is claimed here.
                  </p>
                </>
              }
              caption="Two NCS copies at one occupancy: the only tie on this page that no parent link could have carried."
            />
          </Section>

          <Section
            id="occupancy"
            title="The occupancy specification"
            subtitle={
              <>
                Improves on: <It cat="atom_site" field="occupancy" /> — a number with no record of
                what tied it there
              </>
            }
            tag="experimental"
          >
            <p>
              Everything above concerns which alternates exist and which go together. This section is
              about something narrower that is lost at deposition, and it is marked experimental
              because the hardest of the three cases it describes fits no refinement program in use
              today.
            </p>
            <p>
              The occupancy <em>numbers</em> survive deposition. The <em>specification</em> that
              produced them does not. Whether two alternates were constrained to be complementary or
              merely happen to sum to one, and whether a group&rsquo;s total was refined or held
              fixed, lives in the refinement program&rsquo;s keyword file and is discarded. A reader
              of the deposited file cannot tell the two apart, because they look identical:
            </p>
            <OccupancySpec />
            <p>
              Three optional columns on <Cat name="pdbx_heterogeneity_hierarchy" /> carry it back —{" "}
              <It cat="pdbx_heterogeneity_hierarchy" field="occupancy_completeness" bare /> (the sum
              rule), <It cat="pdbx_heterogeneity_hierarchy" field="occupancy_refine_flag" bare />{" "}
              (refined or fixed) and{" "}
              <It cat="pdbx_heterogeneity_hierarchy" field="occupancy_value" bare /> (the held
              value) — and a fourth,{" "}
              <It cat="pdbx_heterogeneity_hierarchy" field="state_kind" bare />, records whether an
              alternate is conformational (the same thing in a different pose) or compositional
              (something present or absent). Hover any of them for its definition and the values it
              takes.
            </p>
            <p>What a program can do with them falls into three tiers:</p>
            <TierTable />
            <p>
              The third tier is the experimental part. Nothing mainstream fits a child sum tied to a
              refinable parent today; the columns record it so that a pipeline can grow into it, and
              so that a reader can tell a constrained number from a coincidental one. A program that
              ignores all four columns reads exactly the structure it read before.
            </p>
            <StageFigure
              id="7HHS_apo_bound_occ"
              fileUrl="/examples/het/7HHS_apo_bound_occ.cif"
              het
              codeTitle="7HHS_apo_bound_occ — the nested tree + the occupancy specification"
              brief={
                <>
                  <p>
                    The same structure and the same tree as{" "}
                    <Ref to="nesting">the nested-occupancy figure</Ref>, now carrying the
                    specification. <Tok net="apo">apo</Tok> + <Tok net="bound">bound</Tok> = 1 is{" "}
                    <C>complete</C> under the root: an ordinary occupancy group, which every
                    refinement program can already express — tier 2.
                  </p>
                  <p>
                    <Tok net="pose_1">pose_1</Tok> + <Tok net="pose_2">pose_2</Tok> ={" "}
                    <Tok net="bound">occupancy(bound)</Tok> is <C>complete</C> under a{" "}
                    <C>refined</C> parent — tier 3, which no mainstream program fits today. Both
                    pocket states are <C>compositional</C> (the ligand is there or it is not); both
                    ligand poses are <C>conformational</C> (the same fragment, differently placed).
                  </p>
                </>
              }
              caption="A viewer that ignores the extra columns draws exactly what it drew before."
            />
          </Section>

          <PartDivider part="V" title="Open problems" />

          <Section id="open">
            <p>
              <Ref to="locks">The cross-branch lock</Ref> moved the boundary from
              &ldquo;inexpressible&rdquo; to &ldquo;expressible but not yet fitted&rdquo;. Two things
              remain genuinely open.
            </p>
            <h3 className="pt-2 text-[15px] font-semibold text-slate-900">
              Whether the hierarchy needs to be a graph
            </h3>
            <p>
              This proposal keeps a single-parent tree, and an earlier draft did not: it replaced{" "}
              <It cat="pdbx_heterogeneity_hierarchy" field="parent_alt_groups_id" bare /> with an
              edges table so a network could declare several parents. The case that motivated the
              change was two coupled pockets, where a bottom-pocket occupant looked as though it
              answered to both occupants of the pocket above it. On inspection it does not: it answers
              to one of them, and to the other only through the first — which is a nesting, and{" "}
              <Ref to="nesting">the tree carries it</Ref>. Every case on this page turned out the same
              way, so the tree stays until a real second parent is produced. That is a claim about the
              archive rather than about the format, and one deposited counterexample would overturn it.
            </p>
            <p>
              Separately, how to spell a cross-branch tie is now settled in this draft: a typed
              relationship over network names, <C>equal</C> or <C>sum_to</C>. An earlier sketch wrote
              ties as linear equations with a coefficient per term, which is strictly more general —
              it can express a weighted sum such as 2·O(X) = O(Y). No structure has been produced that
              needs one, and the coefficients cost every reader an equation to decode, so they are
              gone. If such a case appears, this is the seam it reopens.
            </p>
            <h3 className="pt-2 text-[15px] font-semibold text-slate-900">The product wall</h3>
            <p>
              Every relationship this proposal can hold is <em>linear</em> — a sum of occupancies, or
              an equality between two. Genuine statistical independence is <em>multiplicative</em>,
              and lies outside it. Take two independent fragments and a water that is ordered only
              when <em>both</em> are bound: its occupancy is a product, and no sum of group
              occupancies equals a product. The only way to stay linear is to enumerate the joint
              species, which is exponential and does not even preserve the independence it is faking.
            </p>
            <SumVsProduct />
            <p>
              So the frontier past this proposal is not the shape of the hierarchy. It is the mixture
              of exclusive (linear) and independent (multiplicative) couplings in one system, which no
              format currently under discussion expresses without either exponential blow-up or a
              constraint language none of them has. Alongside it sit smaller open items: relations no
              program yet consumes, the ragged alternates that refinement still works around with
              phantom residues, and higher-arity exclusions that a pairwise <C>NOT</C> cannot state.
            </p>
          </Section>

          {/* ------------------------------------------------------------------ appendix */}
          <Section id="examples" title="Appendix — the examples">
            <p>
              Each figure above is a local site carved out of a deposited entry. Coordinates are
              copied verbatim from the archive; nothing is idealised or adjusted. What is added is
              the proposed annotation, which by definition does not exist in the archive yet.
              Hydrogens are omitted except where they are the point. The file-by-file glossary is in
              the contents rail, so it can be consulted while reading rather than only at the end.
            </p>
            <p className="text-[13px] text-slate-500">
              The files are regenerated by <C>heterogeneity-proposal/scripts/carve_examples.py</C>,
              and <C>check_examples.py</C> re-measures them and asserts every geometric claim this
              page makes — that the calcium–oxygen distances are 2.0–2.7 Å, that the two ligand poses
              genuinely overlap, that 0.13 + 0.09 = 0.22, and that nothing interpenetrates.
            </p>
          </Section>

          <footer className="border-t border-slate-100 pt-8 text-[13px] leading-relaxed text-slate-500">
            <p>
              To read any of these files with the proposed categories fully linked — tooltips,
              foreign-key graph, reference panel — open it in the Inspector with the dictionary
              selector set to <span className="text-slate-700">+ heterogeneity ext</span>.
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- small pieces */

function Equation({ children }: { children: ReactNode }) {
  return (
    <div className="my-1 border-l-2 border-slate-200 py-1 pl-4 font-mono text-[13px] text-slate-700">
      {children}
    </div>
  );
}

// The plain inventory: what the dictionary already has. Every row here is checked against
// mmcif_pdbx_v50.dic — these are existing categories, not proposals.
function MethodsInventory() {
  const rows: { what: string; where: ReactNode; note: string }[] = [
    {
      what: "Alternate conformations",
      where: (
        <>
          <It cat="atom_site" field="label_alt_id" /> · <It cat="atom_site" field="occupancy" />
        </>
      ),
      note: "Per atom: which alternate it belongs to, and the fraction of copies in which it is present. The everyday mechanism.",
    },
    {
      what: "Sequence microheterogeneity",
      where: <It cat="entity_poly_seq" field="hetero" />,
      note: "Flags a position where the polymer itself is not one sequence — more than one monomer is modelled at one position.",
    },
    {
      what: "Grouping of alternates",
      where: (
        <>
          <Cat name="atom_sites_alt" /> · <Cat name="atom_sites_alt_ens" /> ·{" "}
          <Cat name="atom_sites_alt_gen" />
        </>
      ),
      note: "Names altloc letters and collects them into ensembles. Present in the dictionary; effectively unused in the archive.",
    },
    {
      what: "Multiple models",
      where: <It cat="atom_site" field="pdbx_PDB_model_num" />,
      note: "A whole further copy of the coordinates. NMR ensembles and ensemble refinement use this: each model is one complete state.",
    },
    {
      what: "Alternate-specific bonds",
      where: <Cat name="struct_conn" />,
      note: "Each bond partner is named by a full atom key including the altloc letter, so a bond can belong to one alternate and not another.",
    },
    {
      what: "Displacement, not discrete states",
      where: (
        <>
          <It cat="atom_site" field="B_iso_or_equiv" /> · <Cat name="atom_site_anisotrop" /> ·{" "}
          <Cat name="pdbx_refine_tls" />
        </>
      ),
      note: "How much an atom moves about its position, and how groups of atoms move together — not which discrete alternatives they occupy.",
    },
  ];
  return (
    <dl className="my-4 divide-y divide-slate-100 border-y border-slate-100">
      {rows.map((r) => (
        <div key={r.what} className="py-2.5">
          <dt className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[13px] font-semibold text-slate-800">{r.what}</span>
            <span className="text-[11px]">{r.where}</span>
          </dt>
          <dd className="mt-1 text-[12.5px] leading-relaxed text-slate-500">{r.note}</dd>
        </div>
      ))}
    </dl>
  );
}

// The escalator from Part II to Part III: what breaks, hardest last.
function Escalator() {
  const cases: { text: ReactNode; to: string; where: string }[] = [
    {
      text: (
        <>
          A side chain modelled in two rotamers, entirely inside one residue. The letter relates only
          things that are already together, and the occupancies sum to one there.{" "}
          <em>This one works today.</em>
        </>
      ),
      to: "today",
      where: "1EJG_rotamer",
    },
    {
      text: (
        <>
          Two stretches of one chain that move together, several residues apart — and that use
          different sets of letters, so there is no letter to match on and nothing that says they are
          coupled at all.
        </>
      ),
      to: "networks",
      where: "5E1N_ca_site",
    },
    {
      text: (
        <>
          A network boundary that falls <em>inside</em> a residue: the amide hydrogen follows the
          previous residue while the side chain is its own rotamer, both under the same letter. No
          key built from chain, residue and letter can separate them.
        </>
      ),
      to: "subresidue",
      where: "5E1N_gln8_split",
    },
    {
      text: (
        <>
          A ligand present in 22% of copies, with two poses <em>inside</em> that 22%, so their
          occupancies sum to 0.22 rather than to 1. And the 78% where it is absent has no atoms at
          all — nothing for a per-atom mechanism to label.
        </>
      ),
      to: "nesting",
      where: "7HHS_apo_bound",
    },
    {
      text: (
        <>
          Two alternates in different parts of the structure that cannot co-occur — they clash at
          2.14 Å — with nothing in their grouping to forbid it, because they are not alternatives of
          each other.
        </>
      ),
      to: "exclusions",
      where: "5E1N_arg74_clash",
    },
    {
      text: (
        <>
          Two sites in different chains held to the <em>same</em> occupancy — two NCS copies of a
          partial ligand, refined together. Neither contains the other, so no nesting can say it.
        </>
      ),
      to: "locks",
      where: "constructed_ncs_lock",
    },
    {
      text: (
        <>
          Two independent fragments and a water ordered only when <em>both</em> are bound. Its
          occupancy is a <em>product</em> of theirs, not a sum — and no weighted sum of occupancies
          equals a product. <em>This one is not solved here, or anywhere else yet.</em>
        </>
      ),
      to: "open",
      where: "the product wall",
    },
  ];
  return (
    <ol className="my-4 space-y-2.5 border-y border-slate-100 py-4">
      {cases.map((c, i) => (
        <li key={c.where} className="flex gap-3">
          <span className="mt-0.5 w-4 shrink-0 text-right font-mono text-[11px] text-slate-300">
            {i + 1}
          </span>
          <span className="text-[13px] leading-relaxed text-slate-600">
            {c.text}{" "}
            <a
              href={`#${c.to}`}
              className="whitespace-nowrap font-mono text-[10.5px] text-slate-400 underline decoration-slate-200 underline-offset-2 hover:text-slate-600"
            >
              {c.where}
            </a>
          </span>
        </li>
      ))}
    </ol>
  );
}

// The four proposed categories. Every name here is an MmcifChip, so it carries the same dictionary
// tooltip the Inspector shows — the definitions live in mmcif_pdbx_v50_het_ext.dic, not in this
// component. Columns are listed one by one rather than as a string, so each can be hovered for its
// own type, mandatory-ness and enumeration.
function CategoryReference() {
  const cats: {
    name: string;
    role: string;
    optional?: boolean;
    desc: ReactNode;
    cols: { field: string; optional?: boolean }[];
    child?: { name: string; cols: { field: string; optional?: boolean }[] };
  }[] = [
    {
      name: "pdbx_alt_groups",
      role: "membership — which atoms make one state",
      desc: (
        <>
          Names a <em>network</em>: a set of atoms that together constitute one alternate state. Each
          row selects atoms out of <Cat name="atom_site" /> by chain, an inclusive residue range and
          an altloc letter, optionally narrowed to a single named atom. One network is usually
          several rows sharing an <C>alt_group_id</C>, so its membership need not be contiguous —
          that is what lets one name span two stretches of a chain, or claim one atom out of a
          residue.
        </>
      ),
      cols: [
        { field: "id" },
        { field: "alt_group_id" },
        { field: "auth_asym_id" },
        { field: "auth_seq_id_start" },
        { field: "auth_seq_id_end" },
        { field: "label_alt_id" },
        { field: "label_atom_id", optional: true },
      ],
    },
    {
      name: "pdbx_heterogeneity_hierarchy",
      role: "the tree, and the occupancy grouping",
      desc: (
        <>
          One row per network. It gives the network its parent (<C>.</C> for a root directly under
          the implicit <C>base</C>) and the coexistence group it shares with its siblings — the
          mutually-exclusive set, which is what a crystallographer calls an occupancy group. The four
          trailing columns are the{" "}
          <Ref to="occupancy">occupancy specification</Ref>, and are absent from a file that does not
          record it.
        </>
      ),
      cols: [
        { field: "alt_group_id" },
        { field: "coexistence_group_id", optional: true },
        { field: "parent_alt_groups_id", optional: true },
        { field: "occupancy_completeness", optional: true },
        { field: "occupancy_refine_flag", optional: true },
        { field: "occupancy_value", optional: true },
        { field: "state_kind", optional: true },
      ],
    },
    {
      name: "pdbx_state_coexistence",
      role: "exclusions the tree does not already imply",
      optional: true,
      desc: (
        <>
          A sparse <C>NOT</C>-only list. Each row says two networks may not co-occur. Needed only for
          a cross-branch clash, since mutual exclusion within a coexistence group — and its
          inheritance by descendants — already covers the common cases. <C>AND</C> and <C>OR</C> were
          deliberately left out: they admit several readings. Absent from most files; there is
          exactly one such row in the prototype annotation of 5E1N.
        </>
      ),
      cols: [
        { field: "id" },
        { field: "rule" },
        { field: "heterogeneity_id" },
        { field: "heterogeneity_ids" },
      ],
    },
    {
      name: "pdbx_occupancy_relationship",
      role: "an occupancy tie no parent link can imply",
      optional: true,
      desc: (
        <>
          The escape hatch, for a tie between two networks that no parent relates — one in each of
          two branches, held to the same occupancy. A head row names the tie&rsquo;s{" "}
          <It cat="pdbx_occupancy_relationship" field="type" bare /> and its target; the child member
          table supplies the other side, one network per row, so no field has to hold a list. There
          is no arithmetic in either: a tie is a set of members and a target. Absent from ordinary
          files, because a parent link plus{" "}
          <It cat="pdbx_heterogeneity_hierarchy" field="occupancy_completeness" bare /> already
          carries every tie that runs between a network and its own parent.
        </>
      ),
      cols: [
        { field: "id" },
        { field: "type" },
        { field: "target" },
        { field: "enforced" },
        { field: "details", optional: true },
      ],
      child: {
        name: "pdbx_occupancy_relationship_member",
        cols: [{ field: "relationship_id" }, { field: "state_id" }],
      },
    },
  ];
  return (
    <div className="my-4">
      <dl className="divide-y divide-slate-100 border-y border-slate-100">
        {cats.map((c) => (
          <div key={c.name} className="py-3">
            <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <Cat name={c.name} />
              <span className="text-[11px] text-slate-400">{c.role}</span>
              {c.optional && (
                <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                  optional
                </span>
              )}
            </dt>
            <dd className="mt-1.5 max-w-[92ch] text-[13px] leading-relaxed text-slate-600">
              {c.desc}
            </dd>
            <dd className="mt-2">
              <ColumnList cat={c.name} cols={c.cols} />
            </dd>
            {c.child && (
              <dd className="mt-2 border-l-2 border-slate-100 pl-3">
                <div className="mb-1 flex items-baseline gap-2">
                  <Cat name={c.child.name} />
                  <span className="text-[10px] text-slate-400">child member table</span>
                </div>
                <ColumnList cat={c.child.name} cols={c.child.cols} />
              </dd>
            )}
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11.5px] text-slate-400">
        Hover any name for its dictionary definition — description, type, and the values it may take.
        Mandatory columns are set in <span className="font-semibold text-slate-700">dark</span>;{" "}
        <span className="text-slate-400">grey</span> ones are optional and may be omitted or written
        as <C>.</C> — an arrow marks a column that points at another category&rsquo;s. The four names
        above are the proposal; every <em>other</em> mmCIF name on this page already exists, and
        links to its published definition in the{" "}
        <a
          href={DICT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600"
        >
          wwPDB dictionary
        </a>
        . If a name is not a link, this page is asking for it.
      </p>
    </div>
  );
}

// One category's columns. The foreign-key target is read from the dictionary itself (Item.parents),
// so it cannot drift out of step with the .dic the way a hardcoded list would.
function ColumnList({ cat, cols }: { cat: string; cols: { field: string; optional?: boolean }[] }) {
  const dict = useStore((s) => s.dict);
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {cols.map((col) => {
        const parent = dict?.items[`_${cat}.${col.field}`]?.parents?.[0];
        return (
          <span key={col.field} className="inline-flex items-baseline">
            <MmcifChip
              target={{ kind: "item", cat, field: col.field }}
              variant="inline"
              className={`cursor-help rounded px-1 py-0.5 font-mono text-[10.5px] ${
                col.optional
                  ? "bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  : "bg-slate-100 font-semibold text-slate-700 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              {col.field}
            </MmcifChip>
            {parent && (
              <span className="ml-0.5 font-mono text-[9.5px] text-slate-300" title={`points at ${parent}`}>
                →{parent.replace(/^_/, "")}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// What is lost at deposition: two files that differ in nothing a reader can see.
function OccupancySpec() {
  return (
    <div className="my-4 grid gap-5 border-y border-slate-100 py-4 sm:grid-cols-2">
      {[
        {
          tag: "constrained",
          note: "The refinement was told the two alternates are complementary. The occupancies could not have come out any other way.",
        },
        {
          tag: "coincidental",
          note: "The two occupancies were refined freely and happen to land on 1.00. Nothing ties them.",
        },
      ].map((c) => (
        <div key={c.tag}>
          <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            {c.tag}
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-600">
            <div>A 0.67</div>
            <div>B 0.33</div>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{c.note}</p>
        </div>
      ))}
      <p className="text-[12.5px] leading-relaxed text-slate-500 sm:col-span-2">
        The deposited file is identical in both cases. The distinction lived in the refinement
        program&rsquo;s keyword file, and deposition discards it.
      </p>
    </div>
  );
}

// The two tie types, side by side with what each one reads as. The point of the table is that the
// file never contains an equation: a tie is a set of member names and a target name, and the type
// says how to read the pair.
function RelationshipTypes() {
  const types: { name: string; shape: ReactNode; reads: ReactNode }[] = [
    {
      name: "equal",
      shape: <>one member · one target</>,
      reads: (
        <>
          The member&rsquo;s occupancy is the target&rsquo;s. The cross-branch lock — two NCS copies
          refined together, two sites a depositor holds level.
        </>
      ),
    },
    {
      name: "sum_to",
      shape: <>several members · one target</>,
      reads: (
        <>
          The members&rsquo; occupancies add up to the target&rsquo;s. Only for a sum whose target is
          <em> not</em> the members&rsquo; parent — when it is, the parent link already says it and
          this row would be redundant.
        </>
      ),
    },
  ];
  return (
    <div className="my-4 divide-y divide-slate-100 border-y border-slate-100">
      {types.map((t) => (
        <div key={t.name} className="flex flex-wrap gap-x-4 gap-y-1 py-2.5">
          <div className="w-[9rem] shrink-0">
            <div className="font-mono text-[12px] font-semibold text-slate-700">{t.name}</div>
            <div className="text-[10.5px] text-slate-400">{t.shape}</div>
          </div>
          <p className="max-w-[70ch] flex-1 text-[13px] leading-relaxed text-slate-600">{t.reads}</p>
        </div>
      ))}
    </div>
  );
}

function TierTable() {
  const tiers: [string, string][] = [
    ["ignore", "Knows none of the categories; reads the same _atom_site and refines as it does today. Nothing breaks."],
    ["flat", "Each coexistence group is one occupancy group summing to a constant parent — exactly what Refmac, Phenix, SHELXL and BUSTER already do. No new code."],
    ["nested", "Tie a child sum to a refinable parent, lock two branches, or state a graph equation. No mainstream program does this yet; it is recorded so a pipeline can grow into it."],
  ];
  return (
    <div className="my-4 divide-y divide-slate-100 border-y border-slate-100">
      {tiers.map(([name, desc], i) => (
        <div key={name} className="flex gap-4 py-2.5">
          <div className="w-16 shrink-0">
            <div className="font-mono text-[11px] text-slate-400">tier {i + 1}</div>
            <div className="text-[12px] font-semibold text-slate-700">{name}</div>
          </div>
          <p className="text-[13px] leading-relaxed text-slate-600">{desc}</p>
        </div>
      ))}
    </div>
  );
}

// The Part I figure. The occupants are deliberately unnamed: the two-pocket case and its real names
// arrive in Part IV, and borrowing them here would be nomenclature the reader has not met.
function ThreeAnswers() {
  const cases: { tag: string; m: number[][] }[] = [
    { tag: "independent", m: [[25, 25], [25, 25]] },
    { tag: "correlated", m: [[50, 0], [0, 50]] },
    { tag: "anti-correlated", m: [[0, 50], [50, 0]] },
  ];
  return (
    <div className="my-4 border-y border-slate-100 py-4">
      <div className="mb-4 text-center text-[12px] text-slate-500">
        one file · each occupant present in half the copies{" "}
        <span className="font-mono text-slate-600">X 50 / Y 50 · P 50 / Q 50</span>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        {cases.map((c) => (
          <JointMatrix key={c.tag} tag={c.tag} m={c.m} />
        ))}
      </div>
      <div className="mt-4 text-center text-[12px] leading-relaxed text-slate-500">
        Identical edges — what the file records. Different interiors — the physics it cannot.
      </div>
    </div>
  );
}

function JointMatrix({ tag, m }: { tag: string; m: number[][] }) {
  const rowLabels = ["X", "Y"];
  const colLabels = ["P", "Q"];
  const rowSum = (r: number) => m[r][0] + m[r][1];
  const colSum = (c: number) => m[0][c] + m[1][c];
  const cell = (v: number) => (
    <td
      className="h-8 w-10 border border-slate-200 text-center font-mono text-[11px] tabular-nums text-slate-700"
      style={{ background: `rgba(100,116,139,${(v / 100) * 0.28})` }}
    >
      {v}
    </td>
  );
  const margin = (v: number) => (
    <td className="h-8 w-8 text-center font-mono text-[10.5px] tabular-nums text-slate-400">{v}</td>
  );
  return (
    <div>
      <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">{tag}</div>
      <table className="border-collapse">
        <thead>
          <tr className="font-mono text-[10px] text-slate-400">
            <th className="w-12" />
            <th className="font-normal">{colLabels[0]}</th>
            <th className="font-normal">{colLabels[1]}</th>
            <th className="w-8 font-normal text-slate-300">Σ</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1].map((r) => (
            <tr key={r}>
              <td className="pr-1 text-right font-mono text-[10px] text-slate-500">{rowLabels[r]}</td>
              {cell(m[r][0])}
              {cell(m[r][1])}
              {margin(rowSum(r))}
            </tr>
          ))}
          <tr>
            <td className="pr-1 text-right font-mono text-[10px] text-slate-300">Σ</td>
            {margin(colSum(0))}
            {margin(colSum(1))}
            <td />
          </tr>
        </tbody>
      </table>
      <div className="mt-1.5 text-center font-mono text-[9.5px] text-slate-300">
        top site X / Y · bottom site P / Q
      </div>
    </div>
  );
}

function SumVsProduct() {
  const attempts: [string, string][] = [
    ["f1 + f2", "0.5 + 0.6 = 1.10"],
    ["f2 − f1", "0.6 − 0.5 = 0.10"],
    ["½(f1 + f2)", "= 0.55"],
    ["a·f1 + b·f2 + c", "no fixed a, b, c works"],
  ];
  return (
    <div className="my-4 grid gap-6 border-y border-slate-100 py-4 sm:grid-cols-2">
      <div>
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          linear — expressible
        </div>
        <div className="font-mono text-[12px] text-slate-700">O(edo_B) = O(edo_A)</div>
        <div className="mt-0.5 font-mono text-[11px] text-slate-500">0.40 = 0.40</div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">
          A sum or an equality between occupancies. One{" "}
          <span className="font-mono">equal</span> row holds it. This is{" "}
          <Ref to="locks">the cross-branch lock</Ref>.
        </p>
      </div>
      <div>
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          product — out of reach
        </div>
        <div className="font-mono text-[12px] text-slate-700">O(W) = O(f1) × O(f2) = 0.5 × 0.6 = 0.30</div>
        <p className="mt-2 text-[12px] text-slate-500">No sum of the two marginals reaches 0.30:</p>
        <div className="mt-1 space-y-0.5 font-mono text-[11px] text-slate-400">
          {attempts.map(([a, b]) => (
            <div key={a}>
              <span className="text-slate-600">{a}</span> {b}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Lives in the contents rail, so it is a narrow stacked list rather than a table. The detailed
// claims about each file are in its figure's own description; this is the index.
function ExampleGlossary() {
  const rows: { file: string; site: string; shows: string }[] = [
    {
      file: "1EJG_minimal",
      site: "1EJG · residues 14–16",
      shows: "The baseline: no heterogeneity at all.",
    },
    {
      file: "1EJG_rotamer",
      site: "1EJG · Arg10 + neighbours",
      shows: "An isolated rotamer, A 0.67 / B 0.33. What mmCIF already handles completely.",
    },
    {
      file: "5E1N_ca_site",
      site: "5E1N · residues 20–31, Ca 203",
      shows:
        "Two correlated networks with different letter sets, coordinating one ion. Shown unannotated and annotated. Carries the deposited altloc-specific metal bonds.",
    },
    {
      file: "5E1N_gln8_split",
      site: "5E1N · residues 6–8",
      shows:
        "Gln8: two independent choices reusing the same letter, which a residue-range key cannot separate. The label_atom_id case.",
    },
    {
      file: "7HHS_apo_bound",
      site: "7HHS · pocket + ligand A1A7O",
      shows: "Apo 0.78 / bound 0.22, with two exclusive poses at 0.13 and 0.09. Nested occupancy, in deposited numbers.",
    },
    {
      file: "7HHS_apo_bound_occ",
      site: "7HHS · as above",
      shows: "The same, carrying the occupancy specification columns.",
    },
    {
      file: "5E1N_arg74_clash",
      site: "5E1N · Arg74, water 468",
      shows: "The one real NOT: a 2.14 Å cross-branch clash the tree cannot imply.",
    },
    {
      file: "constructed_two_pocket_flat",
      site: "constructed · 1EJG peptide",
      shows: "The wrong parent: both pockets on base, so the state list admits pairs the occupancies forbid.",
    },
    {
      file: "constructed_two_pocket",
      site: "constructed · 1EJG peptide",
      shows: "The same atoms with the bottom pocket nested under EDO1, where the coupling follows from the tree.",
    },
    {
      file: "constructed_ncs_lock",
      site: "constructed · two 1EJG copies",
      shows: "The cross-branch lock: two NCS copies at one occupancy, which no parent link can state.",
    },
  ];
  return (
    <dl className="mt-3 space-y-3">
      {rows.map((r) => (
        <div key={r.file}>
          <dt className="break-all font-mono text-[10.5px]">
            <a
              href={`#${r.file}`}
              className="text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
            >
              {r.file}
            </a>
          </dt>
          <dd className="text-[10px] text-slate-400">{r.site}</dd>
          <dd className="mt-0.5 text-[11px] leading-snug text-slate-500">{r.shows}</dd>
        </div>
      ))}
    </dl>
  );
}

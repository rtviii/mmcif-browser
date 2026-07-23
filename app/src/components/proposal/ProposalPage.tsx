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
  "pdbx_het_state",
  "pdbx_het_state_members",
  "pdbx_state_coexistence",
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
      { id: "states", label: "Which alternates go together" },
      { id: "exclusions", label: "A combination that cannot occur" },
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
            <h1 className="mb-5 text-[30px] font-semibold leading-tight tracking-tight text-slate-900">
              Encoding structural heterogeneity in mmCIF
            </h1>
            <p className="max-w-[88ch] text-[15px] leading-relaxed text-slate-600">
              A structure is a model of many copies of a molecule, and those copies are not
              identical. A coordinate file records how often each alternate appears, but not which
              alternates appear <em>together</em>. This page states what the format encodes today,
              where that becomes underspecified, and an extension that records the missing information. 
            </p>
            {/* <p className="mt-3 max-w-[88ch] text-[13px] leading-relaxed text-slate-500">
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
            </p> */}
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
              differ from one another, some historical. The proposed extension provides an alternative mechanism anoter alternative mechanism yet, but its addition is motivated by the shortcomings of the categories listed here (elaborated on below) .
Of these, the ones i focus on here are mainly <It cat="atom_site" field="label_alt_id" /> and <It cat="atom_site" field="occupancy" /> and their interplay. Others are either outside of the structural scope of this document or defacto obsolete.
              
              </p>
            <MethodsInventory />
            <p>
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
              alternates appear in the same copy or <em>state</em>. We tackle this later. 
              Here is a toy/abstract example where this becomes problematic:<em>The top site holds one of two occupants (X or Y), and
              the bottom site holds one of two others(P or Q); each of the four members is present in half of the
              copies of the crystal.</em>
              Three physically different crystals then produce a byte-for-byte identical
              file:
            </p>
            <ThreeAnswers />
            <p>
              Each table counts, out of 100 copies, how often a pair of occupants is found together.
              The numbers along the edges (the marginals) — how often each occupant appears at all — are what the
              file records, and they are identical in all three. The interiors (the joints) are completely
              different, and the interior is what the file has no way to write down. In the first,
              the two sites are filled independently; in the second, they always go together; in the
              third, they never do.
            </p>
            <p>
              Everything that follows is about those two things and their names. The edge numbers are{" "}
              <em>marginals</em>, one per occupant, and <It cat="atom_site" field="occupancy" /> is
              exactly a column of them. The interior is the <em>joint</em>, and{" "}
              <Ref to="states">the extension&rsquo;s central category</Ref> is a way of writing one
              interior cell per row.
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
              A few small categories declare what
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
              Heterogeneity enters through the two columns: <It cat="atom_site" field="label_alt_id" /> and <It cat="atom_site" field="occupancy" />. Here one arginine side chain is modelled
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
            {/* <Aside summary="_atom_sites_alt — the existing grouping mechanism, and why it is not enough">
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
            </Aside> */}
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

          <Section id="escalator" title="Where the altlocs and occupancy become insufficient">
            <p>
              Seven cases, in increasing order of difficulty. The first is handled completely by
              what exists today; each one after it asks for something the letter and the occupancy
              cannot supply. The last is expressible here too, but at a price worth naming, so it
              points at Part V rather than at a case.
            </p>
            <Escalator />
          </Section>

          <PartDivider part="III" title="The proposal" />

          <Section id="categories" title="The proposed categories">
            <p>
              The extension is five optional categories, and they do three separate jobs: name the
              alternate states, say which of them exclude one another, and record which of them
              occur <em>together</em>, in what proportion. They point <em>into</em>{" "}
              <Cat name="atom_site" /> through the keys it already has and add no column to it, so a
              program that does not know them reads exactly the coordinates it reads today. Each is
              applied to a real case in <Ref to="networks">Part IV</Ref>.
            </p>
            <CategoryReference />
            <p>
              First, alternatives that share a{" "}
              <It cat="pdbx_heterogeneity_hierarchy" field="coexistence_group_id" bare /> are
              mutually exclusive: at most one of them is present in any one copy. Second, the
              always-present single-conformer part of the structure is the implicit network{" "}
              <C>base</C>: occupancy 1, carrying no membership rows because its atoms are simply
              everything that no other network claims. Only alternates are ever listed.
              Third, and this is the one that is new: a state lists the networks that are{" "}
              <em>present</em>, and a bundle&rsquo;s states are exhaustive. A site left empty in some
              state is spelled by leaving it out, and any combination a bundle does not list has
              joint occupancy zero. That is what lets a state name a thing with no atoms in it — the
              78% of copies in which a ligand is simply not there — and it is why a bundle needs no
              exclusion rows of its own.
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
                    to the oxygens that coordinate it, drawn dashed in the viewer. These are{" "}
                    <em>alternate-specific</em>: Thr26&rsquo;s carbonyl oxygen reaches the ion at
                    2.33, 2.45, 2.65 and 2.10 Å in alternates A, B, C and D, and each of those four
                    contacts is recorded as its own bond against its own letter. The{" "}
                    <strong className="font-semibold text-slate-700">bonds</strong> strip below the
                    viewer lists them: pick one and it lights up in 3D and in the source at once,
                    and stepping through the states dims the bonds whose alternate is not present.
                  </p>
                  <p>
                    It is worth noticing how a bond points at its atoms — by chain, residue, atom
                    name <em>and</em> altloc, through{" "}
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
            title="Membership below the residue (specifying alt groups with atom-precision)"
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
              membership table with it is precisely as expressive as a per-atom state label, reuses the fields that are already present on
              <Cat name="atom_site" />.
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
            id="states"
            title="Which alternates go together"
            subtitle={
              <>
                New: <Cat name="pdbx_het_state" /> — the joint occupancies that the per-atom column
                cannot hold
              </>
            }
          >
            <p>
              Everything so far names alternates and says which of them exclude one another. Neither
              says which alternates are found in the <em>same</em> copy, and that is the quantity{" "}
              <Ref to="problem">Part I</Ref> was about: <It cat="atom_site" field="occupancy" /> is a
              list of marginals, one per network, and the same list is produced by physically
              different structures.
            </p>
            <p>
              <Cat name="pdbx_het_state" /> writes the missing quantity down directly, one row per
              combination that occurs. A row&rsquo;s{" "}
              <It cat="pdbx_het_state" field="occupancy" bare /> is the <em>joint</em> occupancy —
              the fraction of copies in exactly that combination, not the occupancy of any member —
              and the networks making it up are listed in{" "}
              <Cat name="pdbx_het_state_members" />, one per row, because an mmCIF cell holds a
              single value.
              </p>
            <StageFigure
              id="7HHS_apo_bound"
              fileUrl="/examples/het/7HHS_apo_bound.cif"
              het
              codeTitle="7HHS_apo_bound — one bundle, three states, deposited numbers"
              brief={
                <>
                  <p>
                    Fragment-screening entry PDB 7HHS: the ligand pocket —{" "}
                    <Tok res="A/21-25">residues 21–25</Tok> and{" "}
                    <Tok res="A/47-49">residues 47–49</Tok> of chain A — plus both modelled poses of
                    ligand A1A7O. The pocket is modelled in two conformations,{" "}
                    <Tok net="apo">apo at 0.78</Tok> and <Tok net="bound">bound at 0.22</Tok>, which
                    exclude each other; the ligand in two poses that occupy the same space — their
                    closest atoms are 0.02 Å apart, so they cannot both be there —{" "}
                    <Tok net="pose_1">pose_1 at 0.13</Tok> on residue 201 and{" "}
                    <Tok net="pose_2">pose_2 at 0.09</Tok> on residue 202.
                  </p>
                  <p>
                    Those four numbers are the marginals, and they are all{" "}
                    <C>_atom_site</C> carries. The state table adds which pose accompanies which
                    pocket conformation: both poses belong to <Tok net="bound">bound</Tok>, and
                    neither ever occurs with <Tok net="apo">apo</Tok>. Because that is written as a
                    list of combinations rather than as a rule, nothing has to forbid the rest — the
                    combinations not listed have occupancy zero.
                  </p>
                  <p>
                    Note also that the ligand&rsquo;s letters (B, C) do not line up with the
                    pocket&rsquo;s (A, B). &ldquo;B&rdquo; on residue 201 and &ldquo;B&rdquo; on
                    residue 22 are different physical states that happen to share a letter — the same
                    local-letter problem as in Part II, in a second entry.
                  </p>
                </>
              }
              caption="PDB 7HHS. Three states in one bundle: apo (0.78), bound + pose_1 (0.13), bound + pose_2 (0.09)."
            />
            <h3 className="pt-2 text-[15px] font-semibold text-slate-900">
              The bundle: how far a state reaches
            </h3>
            <p>
              A state is a joint assignment, and the obvious worry about joint assignments is that
              they grow: if a state had to name every alternate in the structure, a protein with
              forty partial waters would need a table of astronomical size.{" "}
              <It cat="pdbx_het_state" field="bundle_id" bare /> is what stops that. Networks whose
              occupancies are entangled — where knowing one changes the distribution of another —
              share a bundle, and that bundle&rsquo;s states enumerate their joint distribution and
              nothing else. Networks in different bundles are independent: their occupancies
              multiply, and they are never written out together.
            </p>
            <p>
              The second case is the one the marginals cannot decide, and it is the pair of pockets
              from <Ref to="problem">Part I</Ref>. A phenol ligand or a
              glycol sits in a top pocket at 0.50 each; a second glycol sits in a bottom pocket at
              0.30, a third at 0.20, or the pocket is empty. Those four numbers are everything a
              deposited file carries today, and they are consistent with any number of different
              pairings. Six states say which pairing it is.
            </p>
            <StageFigure
              id="constructed_two_pocket"
              fileUrl="/examples/het/constructed_two_pocket.cif"
              het
              codeTitle="constructed_two_pocket — six states in one bundle"
              brief={
                <>
                  <p>
                    <strong className="font-semibold text-slate-700">Constructed.</strong> A real 1EJG
                    tripeptide; the occupants are built to their correct internal geometry and seated
                    against it. The top pocket, <Tok res="A/501">residue 501</Tok>, holds{" "}
                    <Tok net="Ligand">Ligand at 0.50</Tok> or <Tok net="EDO1">EDO1 at 0.50</Tok>. The
                    bottom pocket, <Tok res="A/502">residue 502</Tok>, holds{" "}
                    <Tok net="EDO2">EDO2 at 0.30</Tok>, <Tok net="EDO3">EDO3 at 0.20</Tok>, or
                    nothing.
                  </p>
                  <p>
                    The six states are one bundle, because what the bottom pocket does depends on
                    what sits above it. Read them against the marginals: the majority species is{" "}
                    <Tok net="EDO1">EDO1</Tok> + <Tok net="EDO2">EDO2</Tok> at 0.25, where two
                    independent pockets would have given 0.50 × 0.30 = 0.15, and{" "}
                    <Tok net="Ligand">Ligand</Tok> with <Tok net="EDO2">EDO2</Tok> is rare at 0.05
                    rather than the same 0.15. Every column still sums to the deposited occupancy —
                    Ligand 0.05 + 0.15 + 0.30 = 0.50 — so the coordinates are untouched and the
                    correlation is the whole of what has been added.
                  </p>
                  <p>
                    Two states, 3 and 6, name only a top-pocket occupant. That is an empty bottom
                    pocket, spelled by omission: a state lists what is present, so 0.30 of the copies
                    have the ligand above and nothing below.
                  </p>
                </>
              }
              caption="Six states, one bundle. The four marginals are the same in every reading of this site; the six joint numbers are not."
            />
            {/* <p>
              One more column, and it is the honest answer to the first question a refinement person
              asks. <It cat="pdbx_het_state" field="provenance" bare /> records where the joint
              number came from: <C>fit</C> if it was refined against the data, <C>restraint</C> if a
              program was told to hold it, <C>assert</C> if the depositor is stating it with no
              program behind it, <C>measured</C> if it came from an independent experiment. Two files
              whose numbers are identical can differ entirely in what those numbers are worth, and
              the coordinates do not show it. The 7HHS figure is <C>fit</C>, the constructed one{" "}
              <C>assert</C>. <Ref to="open">Where a joint occupancy can come from at all</Ref> is
              discussed in Part V, and it is not a small question.
            </p> */}
          </Section>

          <Section
            id="exclusions"
            title="A combination that cannot occur"
            subtitle={
              <>
                New: <Cat name="pdbx_state_coexistence" /> — a zero in the joint, where there is no
                distribution to write
              </>
            }
          >
            <p>
              A bundle woudl be the right tool when you know the populations. We can imagine a case where you know only that
              one combination is impossible — no proportions, no correlation, just a pairing that
              cannot happen. That is a single zero in the joint distribution, and building a whole
              bundle around it would mean inventing the other numbers.
            </p>
            <p>
              Below, an arginine side chain is modelled in three alternates and a nearby water at
              partial occupancy. They are not alternatives of each other — one is a rotamer, the
              other a solvent site — so no coexistence group relates them, and nothing says the
              water is more likely with one rotamer than another. But in alternate B the guanidinium
              nitrogen lands 2.14 Å from the water: not a hydrogen bond, a clash. One <C>NOT</C> row
              records exactly that, and claims nothing else.
            </p>
            <p>
              The two mechanisms do not overlap, and a file should never use both for the same
              combination: a bundle already forbids by omission everything it does not list, so a{" "}
              <C>NOT</C> among a bundle&rsquo;s own members would be redundant at best and
              contradictory at worst. Correlated sites with populations you know get a bundle; a
              stray impossible pairing between otherwise independent sites gets a row here.
            </p>
            <StageFigure
              id="5E1N_arg74_clash"
              fileUrl="/examples/het/5E1N_arg74_clash.cif"
              het
              height="520px"
              codeTitle="5E1N_arg74_clash — one NOT row, and no bundle"
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
                    The exclusion is specific to one alternate, and it is not implied by anything
                    else in the file: the rotamer and the solvent site are not alternatives of each
                    other, and no coexistence group relates them.
                  </p>
                  <p>
                    This file carries no state table, and the strip below the viewer says so. Its
                    state list is the app&rsquo;s own reading — every combination the two groups
                    allow, weighted as though they were independent, with the forbidden pairing
                    struck out. Those percentages are an assumption, not a record, which is exactly
                    the difference <Cat name="pdbx_het_state" /> exists to remove. Here there is
                    nothing better to record: nobody measured how often the water accompanies
                    rotamer C rather than D.
                  </p>
                </>
              }
              caption="PDB 5E1N, Arg74 and water 468. One forbidden pairing, no bundle, and no populations claimed."
            />
          </Section>

          <PartDivider part="V" title="Open problems" />

          <Section id="open">
            <h3 className="pt-2 text-[15px] font-semibold text-slate-900">Does this blow up?</h3>
            <p>
              Within a bundle, yes, in principle; across a structure, no. The cost of the state table
              is exponential in the number of mutually correlated switches inside a{" "}
              <em>single</em> bundle — independent sites are separate bundles,
              and separate bundles add rather than multiply. A structure with several hundred partial
              waters and alternate side chains that do not talk to each other is several hundred
              bundles of one or two states apiece: linear in the number of partial sites, not two to
              the power of anything.
            </p>
            <p>
              A genuine blow-up therefore needs one bundle of fifteen or twenty mutually entangled
              switches — and it seems impossible to refine, measure or otherwise determine a fifteen-way joint
              distribution from one experiment. So i don't think this is a problem in pracitce.. Also something like BinaryCIF would compress away these quite repetitive table quite nicely.
               What remains open is whether some class of
              structure has a bundle much bigger than anything we have looked at.
            </p>
            <h3 className="pt-2 text-[15px] font-semibold text-slate-900">
              Where the joint actually comes from
            </h3>
            <p>
              The schema holds any joint distribution perfectly. The data, in general, do not. The
              average density is a one-body quantity: at each site it carries that site&rsquo;s
              marginal occupancy and nothing more. The joint — which bottom-pocket occupant goes with
              which top-pocket occupant — is a correlation between sites, a many-body quantity, and
              standard refinement against Bragg data does not produce it afaik, let alone CryoEM data. Two crystals with the same
              marginals and completely different correlations give the same average density (see the section about marginals).
            </p>
          </Section>

          {/* ------------------------------------------------------------------ appendix */}

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
      to: "states",
      where: "7HHS_apo_bound",
    },
    {
      text: (
        <>
          Two adjacent pockets whose fillings depend on each other. Four occupancies are deposited,
          and they are the same four whether the pockets are correlated, anti-correlated or
          independent — three different pieces of chemistry, one file.
        </>
      ),
      to: "states",
      where: "constructed_two_pocket",
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
          Two independent fragments and a water ordered only when <em>both</em> are bound. Its
          occupancy is a <em>product</em> of theirs, and no sum of occupancies equals a product.{" "}
          <em>Expressible</em>, by writing the four combinations out — what it costs is that the two
          fragments must then share a bundle, so their independence is implied rather than stated.
        </>
      ),
      to: "open",
      where: "the price of enumerating",
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
      role: "which networks exclude one another",
      desc: (
        <>
          One row per network, naming the coexistence group it shares with its alternatives — the
          mutually-exclusive set, which is what a crystallographer calls an occupancy group. At most
          one member of a group is present in any copy, so their occupancies sum to at most 1; a sum
          below 1 leaves a fraction of copies with none of them. It says nothing about networks at{" "}
          <em>different</em> sites — that is the joint, and it lives in the next category.
        </>
      ),
      cols: [
        { field: "alt_group_id" },
        { field: "coexistence_group_id", optional: true },
        { field: "state_kind", optional: true },
      ],
    },
    {
      name: "pdbx_het_state",
      role: "the joint — combinations that occur, and how often",
      desc: (
        <>
          One row per combination that actually occurs. Its{" "}
          <It cat="pdbx_het_state" field="occupancy" bare /> is the <em>joint</em> occupancy of the
          whole combination — a network&rsquo;s own occupancy, the number{" "}
          <Cat name="atom_site" /> carries, is the sum over every state containing it. The networks
          present are listed in the child table, one per row, because an mmCIF cell holds a single
          value. <It cat="pdbx_het_state" field="bundle_id" bare /> is the unit of correlation:
          states sharing one enumerate a joint distribution and sum to 1, and networks in different
          bundles are independent.
        </>
      ),
      cols: [
        { field: "id" },
        { field: "bundle_id" },
        { field: "occupancy" },
        { field: "provenance", optional: true },
        { field: "details", optional: true },
      ],
      child: {
        name: "pdbx_het_state_members",
        cols: [{ field: "state_id" }, { field: "alt_group_id" }],
      },
    },
    {
      name: "pdbx_state_coexistence",
      role: "a combination that cannot occur",
      optional: true,
      desc: (
        <>
          A sparse <C>NOT</C>-only list: each row says two networks may not co-occur. For a zero in
          the joint where there is no distribution to write — two networks that are otherwise
          independent, no populations known, one impossible pairing. Not needed inside a coexistence
          group, whose members already exclude each other, and not needed inside a bundle, which
          already forbids by omission everything it does not list. Absent from most files; there is
          exactly one such row in the prototype annotation of 5E1N.
        </>
      ),
      cols: [
        { field: "id" },
        { field: "rule" },
        { field: "alt_group_id" },
        { field: "alt_group_ids" },
      ],
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
      {/* <p className="mt-2 text-[11.5px] text-slate-400">
        Hover any name for its dictionary definition — description, type, and the values it may take.
        Mandatory columns are set in <span className="font-semibold text-slate-700">dark</span>;{" "}
        <span className="text-slate-400">grey</span> ones are optional and may be omitted or written
        as <C>.</C> — an arrow marks a column that points at another category&rsquo;s. The five names
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
      </p> */}
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

// The product case, written out. Two independent fragments at 0.5 and 0.6, and a water ordered only
// when both are bound: O(W) = 0.5 x 0.6 = 0.30, which no sum of the two marginals reaches. As a
// state table it is four rows and needs no arithmetic at all — which is the argument for
// enumerating rather than for a constraint language.
function SumVsProduct() {
  const states: [string, string][] = [
    ["f1 + f2 + W", "0.30"],
    ["f1", "0.20"],
    ["f2", "0.30"],
    ["(neither)", "0.20"],
  ];
  return (
    <div className="my-4 grid gap-6 border-y border-slate-100 py-4 sm:grid-cols-2">
      <div>
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          as a relation between occupancies — impossible
        </div>
        <div className="font-mono text-[12px] text-slate-700">
          O(W) = O(f1) × O(f2) = 0.5 × 0.6 = 0.30
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">
          A product, not a sum. No weighted sum of the two fragment occupancies reaches 0.30, so no
          arithmetic relation between occupancies can state it — which is what every earlier draft
          of this proposal tried to write.
        </p>
      </div>
      <div>
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          as states — exact, in four rows
        </div>
        <div className="space-y-0.5 font-mono text-[11px] text-slate-500">
          {states.map(([nets, p]) => (
            <div key={nets}>
              <span className="inline-block w-24 text-slate-700">{p}</span>
              {nets}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">
          The product is now one of the numbers rather than a rule to be satisfied, so nothing has
          to be able to express multiplication. Note what the table does <em>not</em> say out loud:
          0.30 × 0.20 : 0.30 × 0.20 is a product structure, and a reader only learns the two
          fragments are independent by multiplying and checking.
        </p>
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
      shows: "Three states in one bundle, in deposited numbers: apo 0.78, bound + pose_1 0.13, bound + pose_2 0.09.",
    },
    {
      file: "5E1N_arg74_clash",
      site: "5E1N · Arg74, water 468",
      shows: "The one real NOT: a 2.14 Å clash between networks that are otherwise independent, with no populations to record.",
    },
    {
      file: "constructed_two_pocket",
      site: "constructed · 1EJG peptide",
      shows: "Six states in one bundle. The four marginals are what a file carries today; the six joint numbers are what they cannot decide.",
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

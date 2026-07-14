"use client";
import type { ReactNode } from "react";
import { StageFigure } from "./StageFigure";

// Inline code token (category / item / value names).
function C({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.86em] text-slate-700">
      {children}
    </code>
  );
}

function Section({
  n,
  id,
  title,
  children,
}: {
  n?: string;
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-slate-100 pt-9">
      <div className="mb-5 flex items-baseline gap-3">
        {n && <span className="font-mono text-[12px] tabular-nums text-slate-300">{n}</span>}
        <h2 className="text-[19px] font-semibold tracking-tight text-slate-900">{title}</h2>
      </div>
      <div className="space-y-4 text-[14px] leading-[1.75] text-slate-700">{children}</div>
    </section>
  );
}

const CONTENTS: { id: string; label: string }[] = [
  { id: "problem", label: "01 · The missing quantity" },
  { id: "requirements", label: "02 · Requirements" },
  { id: "today", label: "03 · What mmCIF provides" },
  { id: "limit", label: "04 · Where the letter stops" },
  { id: "categories", label: "05 · The proposed categories" },
  { id: "networks", label: "06 · Naming a network" },
  { id: "subresidue", label: "07 · Below the residue" },
  { id: "pattern", label: "08 · One pattern, three layers" },
  { id: "nesting", label: "09 · Nested occupancy" },
  { id: "exclusions", label: "10 · Metals and exclusions" },
  { id: "occupancy", label: "11 · Portable occupancy" },
  { id: "graph", label: "12 · A graph, not a tree" },
  { id: "open", label: "13 · Open problems" },
  { id: "examples", label: "Appendix · The examples" },
];

export default function ProposalPage() {
  return (
    <div className="light-surface h-full overflow-x-hidden overflow-y-auto bg-white text-slate-800">
      <article className="mx-auto max-w-[880px] px-6 py-14">
        <header className="mb-10">
          <div className="mb-3 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            PDBx / mmCIF · proposed extension
          </div>
          <h1 className="mb-4 text-[32px] font-semibold leading-tight tracking-tight text-slate-900">
            Encoding structural heterogeneity in mmCIF
          </h1>
          <p className="max-w-[76ch] text-[15px] leading-relaxed text-slate-600">
            A crystal structure is an average over many copies of a molecule, and those copies are not
            identical. The coordinate file records how often each alternate appears, but not which
            alternates appear <em>together</em>. This page states the problem, shows what mmCIF already
            supports, and sets out an extension that records the missing information without adding a
            column to the coordinate table.
          </p>
          <p className="mt-4 max-w-[76ch] text-[13px] leading-relaxed text-slate-500">
            Every example below is a real mmCIF block: the source on the left, the structure on the
            right. Click a network or a state to highlight the rows that define it. With one labelled
            exception, the coordinates are taken verbatim from deposited entries — see the{" "}
            <a href="#examples" className="underline decoration-slate-300 underline-offset-2 hover:text-slate-700">
              appendix
            </a>
            .
          </p>
        </header>

        <nav className="mb-12 border-y border-slate-100 py-4">
          <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            contents
          </div>
          <ol className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
            {CONTENTS.map((c) => (
              <li key={c.id}>
                <a
                  href={`#${c.id}`}
                  className="text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
                >
                  {c.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-11">
          {/* ------------------------------------------------------------------ 01 */}
          <Section n="01" id="problem" title="The missing quantity">
            <p>
              Diffraction measures the whole ensemble at once, so the electron density is an average.
              mmCIF captures that with two per-atom quantities: an alternate-location letter (
              <C>label_alt_id</C> = A, B, …) and an <C>occupancy</C>, the fraction of copies in which
              an alternate is present. Together these record the <em>marginals</em> of the
              distribution — for each item on its own, how often it appears. They do not record the{" "}
              <em>joint</em>: which alternates occur in the same copy.
            </p>
            <p>
              Two adjacent binding pockets make the gap concrete. Suppose the top pocket holds either
              a ligand or an ethylene glycol, and the bottom pocket holds one of two other ethylene
              glycols. Fix the four occupancies. Three physically different crystals then produce a
              byte-for-byte identical file:
            </p>
            <ThreeAnswers />
            <p>
              The altloc letter cannot recover the difference, because its guarantee is purely local:
              within a small region, alternate A goes with A and never with B. It says nothing about
              whether A at one residue and A two hundred residues away are the same physical state,
              and — as section 04 shows in deposited data — two neighbouring parts of one structure
              routinely use different letter sets. Long-range correlation is the fact that is missing.
            </p>
          </Section>

          {/* ------------------------------------------------------------------ 02 */}
          <Section n="02" id="requirements" title="Requirements, and the one hard constraint">
            <p>
              Three kinds of program read a coordinate file, and an encoding of heterogeneity has to
              satisfy all of them at once. Refinement programs re-fit the model against the data, so a
              heterogeneity description tells them which occupancies are coupled; for them it must be
              unambiguous and machine-actionable. Viewers and parsing libraries read and display but
              never re-fit, so they must be able to ignore a relationship they do not understand and
              still obtain a valid structure. The archive owns long-term coherence, so anything added
              must be automatically validatable and backward compatible.
            </p>
            <p>
              One constraint follows from the second requirement and governs the whole design:{" "}
              <C>_atom_site</C> takes no new mandatory column. A per-atom column there would force
              every reader and every refinement program to change how it parses coordinates, which is
              too high a price for an optional annotation. Additional categories, additional rows, and
              one more join to resolve are cheap by comparison and break no naive reader.
            </p>
            <p>
              Two consequences fall out, and the rest of this page obeys them. There is no reason to
              flatten a graph into a tree in order to save space — if the topology is a graph, encode a
              graph. And there is no reason to compress occupancy semantics into a terse flag when an
              explicit table validates more easily.
            </p>
          </Section>

          {/* ------------------------------------------------------------------ 03 */}
          <Section n="03" id="today" title="What mmCIF provides today">
            <p>
              The baseline, before any heterogeneity machinery. A coordinate file is a spine of
              cross-references: a few small categories declare what the molecule is, and one large
              category, <C>_atom_site</C>, holds the coordinates and points back at them through
              shared keys. Below is a complete, valid file for three residues of crambin. Every atom is
              fully present: occupancy 1.00, no alternate-location letter.
            </p>
            <StageFigure
              fileUrl="/examples/het/ex_minimal.cif"
              view={{ representation: "ball-and-stick", colorTheme: "element-symbol" }}
              height="440px"
              codeTitle="a complete minimal file — PDB 1EJG, residues 14–16"
              caption="The atoms on the right are exactly the rows of the _atom_site loop on the left."
            />
            <p>
              Heterogeneity enters through two existing per-atom columns. <C>label_alt_id</C> marks an
              atom as belonging to one alternate, and <C>occupancy</C> gives the fraction of copies in
              which it is present. Here one arginine side chain is modelled in two positions, A at 0.67
              and B at 0.33, summing to one within the residue. Its backbone carries no letter at all:
              it is single-conformer and shared.
            </p>
            <StageFigure
              fileUrl="/examples/het/ex_rotamer.cif"
              view={{ representation: "ball-and-stick", colorTheme: "alt-loc" }}
              height="440px"
              codeTitle="one residue, two rotamers — atom_site alone is enough"
              caption="PDB 1EJG, Arg10 with single-conformer neighbours. Both alternatives sit inside one residue, so the letter relates only things that are already together. No extension is needed, and none of the proposed categories appear."
            />
            <p>
              Two further pieces of the existing format matter later. <C>_struct_conn</C>, the sparse
              bond table, records the non-template connections — disulfides, links, metal coordination —
              each named by a full atom key including the altloc letter, so a bond can be
              alternate-specific. And there is a dormant legacy mechanism, <C>_atom_sites_alt</C>, which
              groups altloc letters globally with no residue scoping, no parent/child relation and no
              occupancy semantics; it inherits the overloaded-letter problem described next, and is what
              this proposal supersedes.
            </p>
          </Section>

          {/* ------------------------------------------------------------------ 04 */}
          <Section n="04" id="limit" title="Where the letter stops">
            <p>
              The mechanism above works because everything it relates sits inside one residue. It stops
              working as soon as a relationship spans more than one.
            </p>
            <p>
              The file below is the calcium site of calmodulin, exactly as deposited. Two stretches of
              the chain run through it, and each is modelled in several alternates. Residues 20–24 have{" "}
              <em>two</em> alternates, lettered B and D. Residues 25–31 have <em>four</em>, lettered A,
              B, C and D. Each set sums to 1.00, so each is one occupancy group. Both coordinate the
              same calcium ion, so they are physically coupled.
            </p>
            <p>
              Nothing in the file says so. Worse, the letters do not line up: there is no alternate A or
              C in the first stretch at all, and nothing states whether &ldquo;B&rdquo; at residue 20 is
              the same physical state as &ldquo;B&rdquo; at residue 26. A reader cannot recover the
              correlation, and a reader that assumes matching letters mean matching states will be
              wrong. This is the file as it exists today — <C>_atom_site</C> and nothing else.
            </p>
            <StageFigure
              fileUrl="/examples/het/ex_ef_hand.cif"
              view={{ representation: "ball-and-stick", colorTheme: "alt-loc" }}
              het={false}
              truncateBefore="_pdbx_alt_groups"
              codeTitle="the file today — the correlation is unwritten"
              caption="PDB 5E1N, the EF-hand loop around calcium 203. Coloured by altloc letter. Two coupled stretches, two different letter sets, and no record of which alternate goes with which."
            />
          </Section>

          {/* ------------------------------------------------------------------ 05 */}
          <Section n="05" id="categories" title="The proposed categories">
            <p>
              The extension is four optional categories that point <em>into</em> <C>_atom_site</C>{" "}
              through its existing keys, without changing a byte of it. Three carry the spine; the
              fourth is an escape hatch for occupancy relations a tree cannot express, and is absent
              from ordinary files. The sections that follow introduce them one example at a time.
            </p>
            <CategoryReference />
            <p>
              Two reading rules tie the spine together. First, alternatives that share a{" "}
              <C>coexistence_group_id</C> are mutually exclusive, and that exclusivity is inherited by
              their descendants — so <C>_pdbx_state_coexistence</C> is needed only when networks in
              different branches clash anyway. Second, the always-present single-conformer part of the
              structure is the implicit root network, <C>base</C>: occupancy 1, the root of the tree,
              carrying no membership rows because its atoms are simply everything no other network
              claims. Only alternates are ever listed.
            </p>
          </Section>

          {/* ------------------------------------------------------------------ 06 */}
          <Section n="06" id="networks" title="Naming a network">
            <p>
              Two small side tables fix the previous section&rsquo;s file. <C>_pdbx_alt_groups</C> names
              a <em>network</em> — a set of atoms that together constitute one state — by chain, residue
              range and altloc letter. <C>_pdbx_heterogeneity_hierarchy</C> then places each network in a
              tree and assigns it a <C>coexistence_group_id</C>: the mutually-exclusive set it belongs
              to, which is exactly what a crystallographer calls an occupancy group.
            </p>
            <p>
              Here the two stretches become six named networks in two occupancy groups. The correlation
              is now written down: one name spans a whole stretch of the chain, and each group maps
              directly onto an ordinary occupancy group that sums to one. The atoms are unchanged from
              section 04 — only the two side tables are added. Click a network below the viewer to
              highlight the rows that define it.
            </p>
            <StageFigure
              fileUrl="/examples/het/ex_ef_hand.cif"
              het
              codeTitle="+ _pdbx_alt_groups and _pdbx_heterogeneity_hierarchy"
              caption="The same deposited atoms as section 04. The network definitions are the working group's own, from the annotated 5E1N file, clipped to the carved residue range. _struct_conn carries the calcium bonds, which are altloc-specific — Thr26's carbonyl oxygen reaches the ion at 2.10, 2.33, 2.45 and 2.65 Å in the four alternates — and so cannot be reconstructed from a distance cutoff."
            />
          </Section>

          {/* ------------------------------------------------------------------ 07 */}
          <Section n="07" id="subresidue" title="Membership below the residue">
            <p>
              A residue-range key is enough almost everywhere, but not everywhere. A network boundary
              can fall <em>inside</em> a residue, and then the key fails.
            </p>
            <p>
              In the file below, Gln8 carries two independent choices at once. Its backbone amide
              hydrogen follows the conformation of the <em>preceding</em> residues — the N–H points back
              at the previous carbonyl — so it belongs to the residues 6–7 network. Its side chain is its
              own rotamer, in a separate occupancy group with different occupancies. And both choices use
              the same letters: the atoms of Gln8 with <C>label_alt_id</C> = A belong to two different
              networks. A key of (chain, residue range, altloc) cannot separate them; both are
              &ldquo;chain A, residue 8, alternate A&rdquo;.
            </p>
            <p>
              The optional <C>label_atom_id</C> column on <C>_pdbx_alt_groups</C> is the escape hatch:
              when a row names an atom, it claims exactly that atom. A membership table with{" "}
              <C>label_atom_id</C> is precisely as expressive as a per-atom state label, with{" "}
              <C>_atom_site</C> left alone.
            </p>
            <StageFigure
              fileUrl="/examples/het/ex_subresidue.cif"
              het
              codeTitle="label_atom_id splits a residue below the altloc letter"
              caption="PDB 5E1N, residues 6–8. Hydrogens are omitted except Gln8's amide H, which is the atom in question. This is not a contrived case: in the working group's annotated 5E1N there are 28 (residue, altloc) pairs whose atoms fall in two different networks, and it is why that file resorted to a per-atom column."
            />
          </Section>

          {/* ------------------------------------------------------------------ 08 */}
          <Section n="08" id="pattern" title="One pattern, three layers">
            <p>
              Everything above, and everything still to come, is the same idea applied three times. A
              piece of meaning gets a frugal default that costs nothing on an ordinary file, plus an
              explicit escape hatch for the rare case the default cannot reach. Membership has already
              shown both layers: a residue range by default, <C>label_atom_id</C> when a residue must
              split. Exclusivity will show both in section 10. The occupancy layer completes the
              symmetry in sections 11 and 12.
            </p>
            <LayersDiagram />
            <p>
              Reading it as a layer rather than a bolt-on is what keeps the additions small: the default
              carries the common case at near-zero cost and maps straight onto what refinement programs
              already do, while the escape hatch carries the genuinely hard relations and is reached for
              only when the tree cannot speak.
            </p>
          </Section>

          {/* ------------------------------------------------------------------ 09 */}
          <Section n="09" id="nesting" title="Nested occupancy">
            <p>
              Occupancy groups do not always sum to one. When a choice exists only inside another
              choice, the inner group sums to its <em>parent&rsquo;s</em> occupancy — and the tree
              carries that for free.
            </p>
            <p>
              The file below is a fragment-screening entry. Its binding pocket is modelled in two
              conformations, apo at 0.78 and bound at 0.22, and the ligand is modelled in two mutually
              exclusive poses at 0.13 and 0.09. Those numbers are deposited, and the arithmetic is the
              whole argument:
            </p>
            <Equation>0.13 + 0.09 = 0.22 = occupancy(bound)</Equation>
            <p>
              The poses are ordered only within the bound population, so they sum to their parent rather
              than to one. The hierarchy states exactly that: <C>apo</C> and <C>bound</C> share one
              occupancy group under <C>base</C>, and the two poses share a second group whose parent is{" "}
              <C>bound</C>. Two things then follow with no further machinery. A pose can never co-occur
              with apo, because its parent excludes apo — so no exclusion row is needed. And the
              ligand&rsquo;s <em>absence</em>, the 78% of copies in which it has no atoms at all, finally
              has a name: the <C>apo</C> node. A state with no atoms cannot be labelled by any per-atom
              mechanism; only a node in a tree can carry it.
            </p>
            <StageFigure
              fileUrl="/examples/het/ex_nesting.cif"
              het
              codeTitle="a nested tree — parent bound, children pose_1 / pose_2"
              caption="PDB 7HHS. Three legal whole-molecule states: apo (0.78), bound + pose_1 (0.13), bound + pose_2 (0.09). The nesting forbids the rest. Note also that the ligand's letters (B, C) do not line up with the pocket's (A, B) — the same local-letter problem as section 04, in a second entry."
            />
          </Section>

          {/* ------------------------------------------------------------------ 10 */}
          <Section n="10" id="exclusions" title="Metals, and the optional exclusion list">
            <p>
              The metal site of section 06 is where <C>_struct_conn</C> earns its place: the calcium
              bonds are altloc-specific, so they cannot be reconstructed from a distance cutoff and must
              be recorded. The honest cost is that the membership rows and the bond records become two
              separate pointers into <C>_atom_site</C> that a depositor has to keep in sync.
            </p>
            <p>
              Exclusivity, meanwhile, is free within an occupancy group — siblings exclude each other by
              construction. It is <em>not</em> free across branches. Two networks in different parts of
              the tree can be geometrically incompatible without the tree implying anything at all, and
              that is the one thing <C>_pdbx_state_coexistence</C> exists for.
            </p>
            <p>
              Below, an arginine side chain is modelled in three alternates and a nearby water at partial
              occupancy. They live in different branches — one is a rotamer, the other a solvent site — so
              nothing in the hierarchy forbids them co-occurring. But in alternate B the guanidinium
              nitrogen lands 2.14 Å from the water: not a hydrogen bond, a clash. One <C>NOT</C> row
              records it. This is the only exclusion in the whole of the working group&rsquo;s annotated
              5E1N, which is the argument for keeping the category optional, sparse, and{" "}
              <C>NOT</C>-only. <C>AND</C> and <C>OR</C> were deliberately left out: they admit several
              readings.
            </p>
            <StageFigure
              fileUrl="/examples/het/ex_exclusion.cif"
              het
              height="520px"
              codeTitle="one explicit NOT row — the cross-branch clash"
              caption="PDB 5E1N, Arg74 and water 468. Alternates C and D of the arginine clear the water by 3.97 and 4.80 Å; only alternate B collides. The exclusion is specific to one alternate, which is why it cannot be inferred from the tree."
            />
          </Section>

          {/* ------------------------------------------------------------------ 11 */}
          <Section n="11" id="occupancy" title="Making the occupancy specification portable">
            <p>
              The occupancy <em>numbers</em> survive deposition. The <em>specification</em> that produced
              them does not. Whether two alternates were constrained to be complementary or merely happen
              to sum to one, and whether a group&rsquo;s total was refined or held fixed, lives in the
              refinement program&rsquo;s keyword file and is discarded. Three optional columns on the
              hierarchy carry it back — <C>occupancy_completeness</C> (the sum rule),{" "}
              <C>occupancy_refine_flag</C> (refined or fixed) and <C>occupancy_value</C> (the held value)
              — and a fourth, <C>state_kind</C>, records whether an alternate is conformational (the same
              thing in a different pose) or compositional (something present or absent).
            </p>
            <p>This maps onto what programs already do, in three tiers:</p>
            <TierTable />
            <StageFigure
              fileUrl="/examples/het/ex_nesting_occ.cif"
              het
              codeTitle="the nested tree, annotated with the occupancy specification"
              caption="The same structure as section 09, now carrying completeness / refine flag / value / kind. apo + bound = 1 is complete under the root (tier 2). pose_1 + pose_2 = occupancy(bound) is complete under a refinable parent — tier 3, which no mainstream program fits today. A viewer that ignores the extra columns draws exactly what it drew before."
            />
          </Section>

          {/* ------------------------------------------------------------------ 12 */}
          <Section n="12" id="graph" title="A graph the tree cannot hold">
            <p>
              This is the hard case, and the one example on this page that is constructed rather than
              deposited — it has no counterpart in the archive. Two adjacent pockets: the top holds a
              ligand or an ethylene glycol, each at 0.50, summing to one. The bottom holds one of two
              other ethylene glycols, at 0.30 and 0.20, summing to 0.5 — it is empty the other half of
              the time.
            </p>
            <p>
              The tree records the two exclusive pockets cleanly. But read alone it projects them as{" "}
              <em>independent</em>: the state list below the viewer is the full cartesian product of the
              two pockets, and it includes states in which the ligand sits in the top pocket while a
              glycol sits in the bottom one. Those states are not real. This is precisely the ambiguity
              of section 01. The one fact the tree cannot hold is the cross-pocket coupling — the bottom
              pocket is ordered only within the EDO1 population:
            </p>
            <Equation>O(EDO1) = O(EDO2) + O(EDO3)</Equation>
            <p>
              That is a genuine second parent: a directed acyclic graph, not a tree. The proposal carries
              it as one <C>_pdbx_occupancy_constraint</C> row of type <C>linear</C>, shaped like a
              refinement restraint, with <C>enforced = annotation</C> — written down and portable, though
              no mainstream program fits it yet.
            </p>
            <DagDiagram />
            <StageFigure
              fileUrl="/examples/het/ex_dag.cif"
              het
              codeTitle="two pockets + the linear occupancy constraint"
              caption="Constructed, and labelled as such: the peptide is a real 1EJG fragment, and the occupants are built to correct internal geometry, but the arrangement is not a deposited one. The tree reads the pockets as independent, so it admits ligand + glycol states that the coupling forbids; the constraint row at the foot of the block restores the edge the tree drops."
            />
          </Section>

          {/* ------------------------------------------------------------------ 13 */}
          <Section n="13" id="open" title="Open problems">
            <p>
              Section 12 moved the boundary from &ldquo;inexpressible&rdquo; to &ldquo;expressible but
              not yet fitted&rdquo;. Two things remain genuinely open.
            </p>
            <h3 className="pt-2 text-[15px] font-semibold text-slate-900">How to spell the graph</h3>
            <p>
              The graph above can be encoded two ways, and the choice is not settled. Either keep the
              single-parent tree and restore the dropped edge with a <C>linear</C> constraint — what
              section 12 does, and what the viewer here implements — or make the hierarchy itself a graph,
              with a small <C>_pdbx_heterogeneity_edge</C> table carrying typed ties (<C>sum_to</C>,{" "}
              <C>equal</C>) instead of coefficient equations. Both hold this case; neither reaches past
              it. Which becomes the standard is an open design question.
            </p>
            <h3 className="pt-2 text-[15px] font-semibold text-slate-900">The product wall</h3>
            <p>
              Every relationship either spelling can hold is <em>linear</em> — a weighted sum of
              occupancies. Genuine statistical independence is <em>multiplicative</em>, and lies outside
              all of them. Take two independent fragments and a water that is ordered only when{" "}
              <em>both</em> are bound: its occupancy is a product, and no sum of group occupancies equals
              a product. The only way to stay linear is to enumerate the joint species, which is
              exponential and does not even preserve the independence it is faking.
            </p>
            <SumVsProduct />
            <p>
              So the frontier past this proposal is not the graph — the graph is linear, and the escape
              hatch holds it. It is the mixture of exclusive (linear) and independent (multiplicative)
              couplings in one system, which no format currently under discussion expresses without
              either exponential blow-up or a constraint language none of them has. Alongside it sit
              smaller open items: tier-3 relations that no program yet consumes, the ragged alternates
              that refinement still works around with phantom residues, and higher-arity exclusions that
              a pairwise <C>NOT</C> cannot state.
            </p>
          </Section>

          {/* ------------------------------------------------------------------ appendix */}
          <Section id="examples" title="Appendix — the examples">
            <p>
              Each figure above is a local site carved out of a deposited entry. Coordinates are copied
              verbatim from the archive; nothing is idealised or adjusted. What is added is the proposed
              annotation, which by definition does not exist in the archive yet. Hydrogens are omitted
              except where they are the point.
            </p>
            <ExampleGlossary />
            <p className="text-[13px] text-slate-500">
              The files are regenerated by <C>heterogeneity-proposal/scripts/carve_examples.py</C>, and{" "}
              <C>check_examples.py</C> re-measures them and asserts every geometric claim this page makes
              — that the calcium–oxygen distances are 2.0–2.7 Å, that the two ligand poses genuinely
              overlap, that 0.13 + 0.09 = 0.22, and that nothing interpenetrates.
            </p>
          </Section>

          <footer className="border-t border-slate-100 pt-8 text-[13px] leading-relaxed text-slate-500">
            <p>
              The written synthesis and the source memos live in <C>heterogeneity-proposal/</C>. To read
              any of these files with the proposed categories fully linked — tooltips, foreign-key graph,
              reference panel — switch the dictionary selector in the top bar to{" "}
              <span className="text-slate-700">+ heterogeneity ext</span> and open the file in the
              Inspector.
            </p>
          </footer>
        </div>
      </article>
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

// The four proposed categories, as a plain definition list.
function CategoryReference() {
  const cats = [
    {
      name: "_pdbx_alt_groups",
      role: "membership",
      optional: false,
      desc: "Names a network — a set of atoms that together make one state — by pointing into _atom_site through its existing keys. One network can span many rows, so membership need not be contiguous.",
      cols: "id · alt_group_id · auth_asym_id · auth_seq_id_start · auth_seq_id_end · label_alt_id · label_atom_id?",
    },
    {
      name: "_pdbx_heterogeneity_hierarchy",
      role: "tree and occupancy grouping",
      optional: false,
      desc: "Places each network in the tree and assigns its occupancy (coexistence) group. Optionally carries the occupancy specification of section 11.",
      cols: "alt_group_id · coexistence_group_id · parent_alt_groups_id · occupancy_*? · state_kind?",
    },
    {
      name: "_pdbx_state_coexistence",
      role: "exclusions",
      optional: true,
      desc: "A sparse NOT-only list, present only for the cross-branch clash the tree does not already imply. AND and OR were deliberately left out.",
      cols: "id · rule = NOT · heterogeneity_id · heterogeneity_ids",
    },
    {
      name: "_pdbx_occupancy_constraint",
      role: "occupancy relations",
      optional: true,
      desc: "The escape hatch for an occupancy tie a single group cannot express — the graph of section 12. With its _term table it is a portable linear equation. Absent from ordinary files.",
      cols: "id · type · target_group_id · target_value · enforced · + _term.coefficient",
    },
  ];
  return (
    <dl className="my-5 divide-y divide-slate-100 border-y border-slate-100">
      {cats.map((c) => (
        <div key={c.name} className="py-3">
          <dt className="flex items-baseline gap-2">
            <code className="font-mono text-[12.5px] font-semibold text-slate-800">{c.name}</code>
            <span className="text-[11px] text-slate-400">{c.role}</span>
            {c.optional && (
              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                optional
              </span>
            )}
          </dt>
          <dd className="mt-1 text-[13px] leading-relaxed text-slate-600">{c.desc}</dd>
          <dd className="mt-1 font-mono text-[10.5px] text-slate-400">{c.cols}</dd>
        </div>
      ))}
    </dl>
  );
}

function LayersDiagram() {
  const rows = [
    ["membership", "residue range", "label_atom_id names one atom"],
    ["exclusivity", "shared coexistence_group_id", "_pdbx_state_coexistence (NOT)"],
    ["occupancy", "completeness flag ⇒ children sum", "_pdbx_occupancy_constraint (equations)"],
  ];
  return (
    <div className="my-5 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-slate-200 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            <th className="py-2 pr-4 font-semibold">layer</th>
            <th className="py-2 pr-4 font-semibold">frugal default</th>
            <th className="py-2 font-semibold">escape hatch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([layer, def, esc]) => (
            <tr key={layer} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-4 text-slate-700">{layer}</td>
              <td className="py-2 pr-4 font-mono text-[11.5px] text-slate-600">{def}</td>
              <td className="py-2 font-mono text-[11.5px] text-slate-600">{esc}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
    <div className="my-5 divide-y divide-slate-100 border-y border-slate-100">
      {tiers.map(([name, desc], i) => (
        <div key={name} className="flex gap-4 py-3">
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

function ThreeAnswers() {
  const cases: { tag: string; m: number[][] }[] = [
    { tag: "independent", m: [[25, 25], [25, 25]] },
    { tag: "correlated", m: [[50, 0], [0, 50]] },
    { tag: "anti-correlated", m: [[0, 50], [50, 0]] },
  ];
  return (
    <div className="my-5 border-y border-slate-100 py-4">
      <div className="mb-4 text-center text-[12px] text-slate-500">
        one file · fixed marginals{" "}
        <span className="font-mono text-slate-600">Ligand 50 / EDO1 50 / EDO2 50 / EDO3 50</span>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        {cases.map((c) => (
          <JointMatrix key={c.tag} tag={c.tag} m={c.m} />
        ))}
      </div>
      <div className="mt-4 text-center text-[12px] leading-relaxed text-slate-500">
        Identical margins — what the file records. Different interiors — the physics it cannot. That
        interior, the joint distribution, is the entire gap.
      </div>
    </div>
  );
}

function JointMatrix({ tag, m }: { tag: string; m: number[][] }) {
  const rowLabels = ["Ligand", "EDO1"];
  const colLabels = ["EDO2", "EDO3"];
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
    </div>
  );
}

function DagDiagram() {
  return (
    <figure className="my-5 border-y border-slate-100 py-4">
      <div className="grid gap-6 sm:grid-cols-2">
        <MiniGraph
          title="a tree — one parent each"
          second={false}
          note="Nesting EDO2 and EDO3 under EDO1 gives O(EDO2) + O(EDO3) = O(EDO1) for free — but records nothing about the ligand."
        />
        <MiniGraph
          title="the graph — two parents"
          second
          note="EDO2 and EDO3 answer to both EDO1 and the ligand. The dashed edges are exactly what a single-parent tree must drop."
        />
      </div>
      <figcaption className="mt-3 text-center text-[11.5px] text-slate-500">
        The proposal keeps the tree and restores the dropped edges as one linear occupancy constraint.
      </figcaption>
    </figure>
  );
}

function MiniGraph({ title, second, note }: { title: string; second: boolean; note: string }) {
  const nodes: [number, number, string][] = [
    [100, 20, "base"],
    [50, 98, "EDO1"],
    [150, 98, "Ligand"],
    [48, 176, "EDO2"],
    [116, 176, "EDO3"],
  ];
  const line = (x1: number, y1: number, x2: number, y2: number, dash?: boolean) => (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={dash ? "#5b7fa6" : "#cbd5e1"}
      strokeWidth={1.3}
      strokeDasharray={dash ? "4 3" : undefined}
    />
  );
  return (
    <div>
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">{title}</div>
      <svg viewBox="0 0 200 200" className="mx-auto block w-full max-w-[230px]" role="img" aria-label={title}>
        {line(100, 32, 50, 86)}
        {line(100, 32, 150, 86)}
        {line(50, 110, 48, 164)}
        {line(50, 110, 116, 164)}
        {second && line(150, 110, 48, 164, true)}
        {second && line(150, 110, 116, 164, true)}
        {nodes.map(([x, y, label]) => (
          <g key={label}>
            <rect x={x - 28} y={y - 11} width={56} height={22} rx={3} fill="#f8fafc" stroke="#e2e8f0" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#64748b">
              {label}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-2 text-center text-[11.5px] leading-snug text-slate-500">{note}</p>
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
    <div className="my-5 grid gap-6 border-y border-slate-100 py-4 sm:grid-cols-2">
      <div>
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          linear — expressible
        </div>
        <div className="font-mono text-[12px] text-slate-700">O(EDO1) = O(EDO2) + O(EDO3)</div>
        <div className="mt-0.5 font-mono text-[11px] text-slate-500">0.5 = 0.3 + 0.2</div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">
          A weighted sum of occupancies. One <span className="font-mono">linear</span> constraint row
          holds it. This is the graph of section 12.
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

function ExampleGlossary() {
  const rows: { file: string; source: string; site: string; shows: string }[] = [
    {
      file: "ex_minimal.cif",
      source: "1EJG",
      site: "residues 14–16",
      shows: "The baseline: a complete file with no heterogeneity at all.",
    },
    {
      file: "ex_rotamer.cif",
      source: "1EJG",
      site: "Arg10 + neighbours",
      shows: "An isolated side-chain rotamer, A 0.67 / B 0.33. What mmCIF already handles completely.",
    },
    {
      file: "ex_ef_hand.cif",
      source: "5E1N",
      site: "residues 20–31, Ca 203",
      shows: "Two correlated multi-residue networks with different letter sets, coordinating one ion. Used twice: unannotated (section 04) and annotated (section 06). Carries the deposited altloc-specific metal bonds.",
    },
    {
      file: "ex_subresidue.cif",
      source: "5E1N",
      site: "residues 6–8",
      shows: "Gln8: two independent choices reusing the same letters, so a residue-range key cannot separate them. The label_atom_id case. Retains the amide hydrogen.",
    },
    {
      file: "ex_nesting.cif",
      source: "7HHS",
      site: "pocket + ligand A1A7O",
      shows: "Apo 0.78 / bound 0.22 with two exclusive ligand poses at 0.13 and 0.09. Nested occupancy, in deposited numbers.",
    },
    {
      file: "ex_nesting_occ.cif",
      source: "7HHS",
      site: "as above",
      shows: "The same structure carrying the occupancy specification columns.",
    },
    {
      file: "ex_exclusion.cif",
      source: "5E1N",
      site: "Arg74, water 468",
      shows: "The one real NOT exclusion: a 2.14 Å cross-branch clash the tree cannot imply.",
    },
    {
      file: "ex_dag.cif",
      source: "constructed",
      site: "1EJG peptide + built occupants",
      shows: "The two-pocket graph. No deposited counterpart exists; the occupants are built to correct internal geometry and placed clear of the peptide.",
    },
  ];
  return (
    <div className="my-5 overflow-x-auto">
      <table className="w-full border-collapse text-left align-top text-[12.5px]">
        <thead>
          <tr className="border-b border-slate-200 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            <th className="py-2 pr-4 font-semibold">file</th>
            <th className="py-2 pr-4 font-semibold">entry</th>
            <th className="py-2 pr-4 font-semibold">site</th>
            <th className="py-2 font-semibold">what it shows</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.file} className="border-b border-slate-100 align-top last:border-0">
              <td className="py-2.5 pr-4 font-mono text-[11px] text-slate-600">{r.file}</td>
              <td className="py-2.5 pr-4 font-mono text-[11px] text-slate-500">{r.source}</td>
              <td className="py-2.5 pr-4 text-[12px] text-slate-500">{r.site}</td>
              <td className="py-2.5 leading-relaxed text-slate-600">{r.shows}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

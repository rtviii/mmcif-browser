Ok i'm reading through the proposal blog and we still need to improve quite a bit of polish here to make the explanations more understandable. Perhaps split, group and differentiate some things further, imrpove the readability and explanation of the examples. Beef up and develop the transition from "what's there already in mmcif" to the problems it doesn't accommodate, the examples of these cases and then the our proposal with example-by-example dissection of how it addresses these things. this is my general impression. I'll go through the proposal page in detail now and record my thoguhts in detail. In general we want to also get rid completely of all the operational language and considerations from our brainstorming in my source docs and the encoding chat that have spilled over into our proposal text. This should be a self-contained and self-sufficient, objective document(s).


Im gonna mix ui and content feedback here...



- Let's increase the width of the text section so there is less empty space on the page.
- less empty space between titles, subtitles and text. Let's make everything more compact and only sections as i described them above  should be well separate by empty space.
- before part 1, give a brief, organized summary of all the methods that exist in the pdb to encode heterogeneity. Just a plain statement of fact of what's possible. This will set up the problem.
- in Part 1, The problem -- make the title more informative. rephrase the summary so as to not refer to diffraction per se (you cna still use it as an example), but more the problem of encoding heterogeneity because that's what we are tackline here. You can go lighter on the statistical jargon, but keep the figure, just explain it in plainer words. the "one file · fixed marginals Ligand 50 / EDO1 50 / EDO2 50 / EDO3 50" thing comes way before these ligand/edo nomenclatrue gets introduced. Either expplain them or make the names more generic and only in service of the example..
- "Requirements, and the one hard constraint" -- delete completely. This is opertaional for us.
- Part II "Part II
What mmCIF encodes today
What mmCIF provides today" duplicates this unnecessary. 
- the wording is too terse and arcane, again, as im saying -- referring to context that is indeed amply developed in our source docs, but that is still absent from the proposal. For example shit like "The baseline, before any heterogeneity machinery". I kno wthat you are referring to the fact that we will develop the "heterogeneity machinery" henceforth and that's the ultimate point, but to a reader that reads the blog from beginnign to end this might come off a bit loaded. There are plenty exampels like this in the text. In this particular case i would say it is even unnecessary to refer to furhter sections, but overall -- such wording can either be expanded to a few more simple words or omitted or folded into a collapsible note or a tooltip. Don't make it too verbose either though. 


- now we come to the first example demo file: 1EJG_minimal. the following comments generalize for all further example section as well. I defeinitely like how thye are self-contained semi-general dropdown elements, but almost in each case you stick some comments into the cif file like 
```
# Crambin (PDB 1EJG, 0.54 A), residues Asn14-Val15-Cys16 of chain A.
# Coordinates are the deposited ones, copied verbatim; hydrogens omitted.
#
# The baseline: a coordinate file is a spine of cross-references, and _atom_site holds
# the coordinates. Every atom is fully present -- occupancy 1.00, no label_alt_id.
# Every later example is a delta against this.
```
I'm not in principal against this for sparse informative comments but in this case you are just repeating a lot of the text that this section contains already. For some later examples -- this preabmle is indeed very informative and you hide a lot of explanations of the particulars of the structure or heterogneeity we are mapping into these comments. I'd say let's actually have a separately formatted text block inside each example's dropdown so this info is not hidden inside the fuckign mmcif blocks and comments, but clearly belongs to this particular examples (one level of detail finer even than the given [sub]section it belongs to). In this new text block if you refer to any residues/atoms/networks and occupancies etc. -- you can actually wrap them in linkable codeblocks that work the same way as interactor buttons on the bottom already do...

- when there "No alternates in this file: every atom is fully occupied, so there is nothing to select." -- don't display that bottom row if there are no hetergogeneity stuff.. on the second example thouhg 1EJG_rotamer -- there are clearly two altlocs for a few atoms so i dont understand why there are no buttons and it stil lsays "No heterogeneity annotation in this file — colour is the raw altloc letter, and none of the proposed categories appear.". 


- Please tag these first few examples "vanilla cif" and our later ones with the switch -- "Extended".

- remove "PDB 1EJG, Arg10 with single-conformer neighbours. Both alternatives sit inside one residue, so the letter relates only things that are already together. No extension is needed, and none of the proposed categories appear."

- ". And there is a dormant legacy mechanism, _atom_sites_alt, which groups altloc letters globally with no residue scoping, no parent/child relation and no occupancy semantics; it inherits the overloaded-letter problem described next, and is what this proposal supersedes." -- make a tooltip/footnote..


- "Where the letter stops" -- absolutely schizophrenic title overloaded with our context. Formulate what the section actually describe. Actually doesn't even fucking need a divider or a subsection -- this just describes the problem with altlocs, so can be a direct continuation. Same UI/cif comments-buried-info as described above for the 5E1N example...


Ok we are onto the "Proposal part III". Before we actually move into here it would be good to have a volley of 5-7 illustrative examples/scenarios of increasing difficulty (by scenarios/examples i mean just a few sentences at most as bulletpoints) that just motion at where this altlocs/occupancy/xxx(forget the third thing) breaks down in the real world..


Ok now to the proposal.

"The extension is four optional categories that point into _atom_site through its existing keys, without changing a byte of it. Three carry the spine; the fourth is an escape hatch for occupancy relations a tree cannot express, and is absent from ordinary files. The sections that follow introduce them one example at a time." -- make shorter (1 sentece or 2 short ones stating that we aim to tackle some of the problmes above basically with this categories). nothing more than a nominal intro.

Then to your presentation of each category. This is arguably the most important piece of the text that people will look at to assess the viability/punch holes in it mentally so we should defineily disentangle the wording here and make it connect better with both what people know about mmcif already and when we introduce something new -- motivate it thoroughly it in its description.


Ex.

```
_pdbx_alt_groups
membership
    Names a network — a set of atoms that together make one state — by pointing into _atom_site through its existing keys. One network can span many rows, so membership need not be contiguous.
    id · alt_group_id · auth_asym_id · auth_seq_id_start · auth_seq_id_end · label_alt_id · label_atom_id?
```

This can be accomplished both by developing/differentiating/strengthening each introductory general description here (i.e "names a network..blah blah") but also by adding a tooltip to each new category that when hovered explains what it is, what values it would take etc (its type and general short description) -- like any vanilla mmcif category in the dict already does!!! If something refers to a different category via the "foreign key" mechanism (like im assuming "label_alt_id" does here if i understand correctly -- please specify that too). Make the added categories actually styled black for each non optional and the optionals -- slightly more gray (ex. "occupancy_*?" further) and explain well what the fuck you mean by "_*?" -- a regex? -- spell it out in the tooltip).


Ok this will be our introduction to the proposal without any examples. small vertical space. 
now we go to the examples...

- "The existing prototype, and the column it adds" section is fucking terrible and refers a bunch as im saying above to the requiements we dedcided to delete and the "folks" references again refers to our internal communication. This whole section is sort of redundantly bemoaning how bad the choice of adding a column to the atom site is. You can just have one sentence later on saying that we decided to perhaps not to do this because it would involve a lot more changes and we can use atom_label_id anyway... just as footnote, so this section and table as a whole can go awya...

- "one pattern three layers" is a section filled with language that i criticized in the beggingin, just general super conext-loaded proclamations and references that are opaque to any reader but myself and you. Remove this in favor of better explanations for the proposal...

- the next section "Making the occupancy specification portable" is incredibly convoluted, but i think might actually be important later on, right? That is, you again make the mistake of putting the proposed solution befroe the problem (as an example later on) is introduced. In fact is this even necessary right now for us to address all the issues with the proposal or is the switch to DAG enough? I feel like this is currently redundant and might only become relevant at the very end for things that are "co-refined" aginast a shared parent that the section anyway specifes no refinment rpogram does at the moment.. Move this section downstairs, improve the wording, tag it "experimentl" and explain it with simple lines/graphs first on top of the huge example we have here (it moves down with the section)...


---------------------------
Part IV The Cases..

Ok regarding examples here.. it's never quite clear what each example is serving to showcase -- the vanilla mmcif drwaback or our proposal so let's stick with our proposal in terms of wording. 

As before, these examples are very shittily named and the text in each uses thsi overloaded language and refers to sections we scrapped. So let's fix that. For example,

- "Naming a network" -- should be something like "Explicit state grouping" title and subtitle saying something like "improvement over: altlocs (label_alt_id)". The the text should be developing briefly but informatively why our categories improve the vanilla case and the example shows it.


Ok next

- "Membership below the residue" -- again, let's do title subtitle which refer to exactly what's being changed and for what purpose (the ostensible improvement over the vanilla or "previous proposal"s)

- "Nested occupnacy" -- overall pretty good, but same as before -- let's do title+subtitle and the text should plainly state what was the problem before and how these categories (refer ot the fucking categories) fix the problem. Right now the text kind of just jerks its own cock in the sense that there are a bunch of AGAIN loaded things like " and the tree carries that for free", " — so no exclusion row is needed", etc. that kinda make sense to me, but fuck as alwasy refer to the concepts outside this section so would be hard for the new reader to grok...


- The "The metal site of naming a network is where _struct_conn earns its place: the calcium bonds are alternate-specific, so they cannot be reconstructed from a distance cutoff and must be recorded. The honest cost is that the membership rows and the bond records are two separate pointers into _atom_site that a depositor has to keep in sync." _struct_conn is never explained previously so you just thrwoing it out there is very jarring. I don't understand the problem and i certaintly dont understand whaty ou mean by "The metal site of naming a network" -- please either explain this in a bit more detail and how it relates to what is being described here at all (the exclusion list...)...


- next example : "A graph the tree cannot hold" -- absolutely terrible name for a an example that is vital for us to solve.. title + subtitle. "This is the hard case, and the one example on this page that is constructed rather than deposited — it has no counterpart in the archive." -- again, operational and unnecessary. remove. 
When you set up the example : " the top pocket holds a ligand or an ethylene glycol, each at 0.50, summing to one; the bottom pocket holds one of two other ethylene glycols, at 0.30 and 0.20, summing to 0.5 — it is empty the other half of the time." put which EDOs go into which pocket in parentheses..


"That is a genuine second parent: a directed acyclic graph, not a tree. The proposal carries it as one _pdbx_occupancy_constraint row of type linear, shaped like a refinement restraint, with enforced = annotation — written down and portable, though no mainstream program fits it yet." -- please again fucking elaborate what the fuck is a "enforced==annotation" and in general explain how our new categories are supposed to enable this optional DAG and why we need to refer to refinement shit in there at all...?



Ok lastly, let's say we convince the reader with our pictorial depiction of edos/ligand. Then they go to look at the mmcif text itself hoping to find some specification of that DAG-like edges on top of the hierarchy.. And then they see this:
```
_pdbx_heterogeneity_hierarchy5 rows
alt_group_idcoexistence_group_idparent_alt_groups_idoccupancy_completenessoccupancy_refine_flagoccupancy_valuestate_kind
base····1.0·
Ligandtop_pocketbasecompleterefined·compositional
EDO1top_pocketbasecompleterefined·compositional
EDO2bot_pocketbaseincompleterefined·compositional
EDO3bot_pocketbaseincompleterefined·compositional
#
_pdbx_occupancy_constraint1 rows
idtypetarget_group_idtarget_valueenforceddetails
1linear·0.0annotation
#
_pdbx_occupancy_constraint_term3 rows
constraint_idalt_group_idcoefficient
1EDO11.0
1EDO2-1.0
1EDO3-1.0
```

What the fuck is _pdbx_occupancy_constraint_term and how do we read it? give more examples of how this might be used upfront and how(whether)it dovetails with a regular tree.. how to read these coefficients and why are these coefficients at all an not just links to nodes as i we would imagine in a DAG? Explain this in the text and explain it tome.
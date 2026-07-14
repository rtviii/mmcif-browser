Stephanie  [10:58 PM]
@Justin Biel @Jaime Fraser this is the update with encoding. tl;dr we need something to specify which states are mutually exclusive with other states. When I proposed the exclusivity tag within the hierarchy loop Ezra correctly pointed out that it would cause a circular graph and therefore was not acceptable.
[10:58 PM]Proposal #1:
[10:58 PM]_pdbx_heterogeneity_hierarchy.name ---> mandatory _pdbx_heterogeneity_hierarchy.parent ---> pointer to another _pdbx_heterogeneity_hierarchy.id _pdbx_heterogeneity_hierarchy.id ---> category key, mandatory _pdbx_heterogeneity_hierarchy.exclusitivty ---> pointer to other _pdbx_heterogeneity_hierarchy.ids _pdbx_heterogeneity_hierarchy.details
[10:59 PM]I have now created two loops that are connected via alt loc ID to describe exclusivity. I thought about name, but that is in the hierarchy loop and I think it is cleaner for both to be attached to the atom table and we can do backend interactions from there.
[11:00 PM]You can also see a case where someone would not use the hierarchy, but just the mutual exclusitivity
[11:00 PM]The new proposal to to have the original loop:
[11:00 PM]loop_
_pdbx_heterogeneity_hierarchy.name ---> mandatory
_pdbx_heterogeneity_hierarchy.parent ---> pointer to another _pdbx_heterogeneity_hierarchy.id
_pdbx_heterogeneity_hierarchy.id ---> category key, mandatory
_pdbx_heterogeneity_hierarchy.ids
_pdbx_heterogeneity_hierarchy.details[11:00 PM]and an exclusivity loop:
[11:00 PM]loop_
_pdbx_state_exclusivity.name —--> should match with _pdbx_heterogeneity_hierarchy.name
_pdbx_state_exclusivity.id  ---> category key, mandatory (connects to atom table)
_pdbx_state_exclusivity.exclusitivity_id(s) ---> points to other ids from atom table that states are exclusive with[11:01 PM]Here is the updated proposal: https://docs.google.com/document/d/1vxT0K5ioAjJWIk3dx7vtxuWOHOtUxyLs4p6reI2UzR8/edit?tab=t.0
[11:01 PM]I have sent this along, but if either of you see issues, please let me know ASAP
Jaime Fraser  [5:05 PM]
Can we get Keedy's eyes on it too as a last check?
[5:05 PM]maybe also Frank von delft and Nick Pearce?
Jaime Fraser  [5:11 PM]
my read is that this looks good
[5:11 PM]it is complicated
[5:11 PM]but makes sense
Justin Biel  [5:11 PM]
Makes sense to me. It is a bit unfortunate to have to create support for two new _loop tables, but it is cool that in theory you can use just one of either in different situations and it does capture the nuance of what we need it to. I'll try to find some time later this week to see if I can come up with weird cases where this could break.
Jaime Fraser  [5:12 PM]
Paul Emsley too
Stephanie  [5:13 PM]
I will reach out to all
[5:14 PM]My biggest worry is the name v. id
[5:14 PM]do we require name to be the same if both loops are being used (I would like this to be YES) but unclear if this is allowed with mmCIF
[5:15 PM]But this also updates our algorithmic encoding strategy @Justin Biel.
Justin Biel  [5:19 PM]
How are you envisioning that changing in response?
[5:21 PM]In that you want to support the choice and use of using either table individually, or both from qFit or whatever encoding method we are working on?
Stephanie  [5:21 PM]
exclusivity should be relatively easy (at least a the level of clashing)
[5:21 PM]hierarchy will still be more difficult as we have discussed
[5:22 PM]yes, default = both but enable people to use exclusivity without hierarchy
Stephanie  [10:05 PM]
https://journals.iucr.org/d/issues/2017/03/00/ba5259/ba5259.pdf
Andy Burnim  [3:37 PM]
joined #encoding.Stephanie  [9:39 PM]
See https://diffuse-global.slack.com/docs/T092HL7DA6S/F0A3PKWEXGW for initial list of attendees. Let's just throw names out there and we can trim in January
Canvas People we want to extend an invite to a task force for ensemble encoding/validation 
CanvasPaul Adams
Paul Emsley
Steve Burley
Andrej Sali
Frank Von Delft
Garib Murshudov
Pilar Cossio
Max bonobo
Nick Pearce
Canvas updated  [9:43 PM]
Stephanie Wankowicz made updates to People we want to extend an invite to a task force for ensemble encoding/validation 
.Stephanie  [9:46 PM]
Also tagging @Jaime Fraser for this task ^^
Stephanie  [2:00 PM]
I got some great advice from Paul Emsley about coot integration. 1) :+1: for mmCIF working group. 2) he suggests working with Gemmi to code things up which probably means chatting with Gemmi folks on supporting this (I will aim to do that this week).
[2:01 PM]If it is supported by Gemmi then visualization and labeling/outputting should be relatively simple. However, the way they do real space refinement does not really work well with existing altloc and suspects the same with hierarchy info.
Stephanie  [10:15 AM]
Additional chat with Frank von delft et al. We are targeting a meeting with Gemmi and CCP4 folks for the first week of February (see email coming soon). Frank's team will work on getting example encoding from 4-5 compositional/conformation heterogeneity examples derived from panDDA, we are responsible for 4-5 conformational heterogeneity examples (all with corresponding SF). We should also outline what tools and encoding we need to be in Gemmi.
[10:16 AM]Everyone is in agreement that if we get this in gemmi, it will become a relatively trivial problem to get visualization and refinement on the CCP4 side.
Justin Biel  [3:37 PM]
It sounds like our approach on what to build here depends on how much buy-in we can get from the Gemmi team and the timeline for them to add this support. During our encoding meeting on Monday we should discuss how this changes what we want to build and how we want to build it.

I'm going to work on some scripts to help automate the generation of these example files. Outside of small cut-out sections of proteins figuring out which heterogeneity sections should be grouped, related or kept independent is really tedious for real world examples.
Stephanie  [3:40 PM]
Agree
Stephanie  [4:01 PM]
my read is that the more explicit we can be about what needs to be written (specifying the interaction between the atom table and external loops) the faster this will be.
Canvas updated  [9:06 PM]
Andy Burnim made updates to January 12th Encoding Meeting
.Stephanie  [8:05 PM]
mmCIF working group presentation set for March 3rd!
Stephanie  [3:52 PM]
Gemmi meeting is next Tuesday at a super early hour due to trying to find London/Tokyo/east coast time.
Stephanie  [3:55 PM]
If we can get a list of items or things to be added to gemmi here, that would be great (edited) 
Stephanie  [9:35 PM]
https://github.com/project-gemmi/mmcif-benchmark
project-gemmi/mmcif-benchmarkBenchmarks for reading and interpreting mmCIF filesStars8LanguagePythonAdded by GitHubStephanie  [9:47 PM]
https://docs.google.com/document/d/1o1OLgydPop1R50GHDda7CRyByGA9yquy6j1BJzySG3Y/edit?tab=t.0
Stephanie  [10:02 PM]
sorry - zoom update
[10:03 PM]2 minutes!
Stephanie  [1:44 PM]
herding cats
Justin Biel  [1:45 PM]
Debrief during our next meeting, or chat briefly now?
Stephanie  [1:46 PM]
I have 10 minutes now?
Justin Biel  [1:47 PM]
https://meet.google.com/msa-tung-kxw
meet.google.comMeetReal-time meetings by Google. Using your browser, share your video, desktop, and presentations with teammates and customers.Pinned by Andy Burnim  [3:43 PM]
Please add items here for discussion before our Encoding Check-in Meeting Monday at 2 pm CT / 3 pm ET
Canvas Encoding Bi-weekly Meeting Minutes
CanvasMeetings 2 pm CT/3 pm ET on Zoom
ClickUp: https://sharing.clickup.com/9017806996/l/h/6-901710262741-1/5b57da7170df41b
March 12th
Items

Stephanie will have checked in with Marcin
Stephanie will have updates from the mmCIF working group (March 3 meeting) 
Justin will detail larger level tasks for encoding alongside the developed infrastructure roadmap 
This includes a document outlining minimal tooling and benchmarks needed to communicate with hierarchical conformational group

We will discuss leftover prep for the hierarchical conformational group if any
Canvas updated  [3:46 PM]
Andy Burnim made updates to Encoding Bi-weekly Meeting Minutes
.Andy Burnim  [12:22 AM]
replied to a thread:Reminder bump for tomorrow! 
Canvas updated  [3:15 PM]
Stephanie Wankowicz and Andy Burnim made updates to Encoding Bi-weekly Meeting Minutes
.Andy Burnim  [3:56 PM]
Bump to review and add items for our encoding meeting tomorrow
Canvas updated  [4:02 PM]
Andy Burnim and Justin Biel made updates to Encoding Bi-weekly Meeting Minutes
.Stephanie  [12:59 AM]
@Justin Biel could you put the claude design doc for hierarchical encoding here?
Canvas updated  [5:10 PM]
Andy Burnim made updates to Encoding Bi-weekly Meeting Minutes
.Andy Burnim  [5:47 PM]
For our next meeting (March 12):

Stephanie will have checked in with Marcin
Stephanie will have updates from the mmCIF working group (March 3 meeting) 
Justin will detail larger level tasks for encoding alongside the developed infrastructure roadmap 
This includes a document outlining minimal tooling and benchmarks needed to communicate with hierarchical conformational group

We will discuss leftover prep for the hierarchical conformational group if any 
Stephanie  [6:20 PM]
Just finished mmCIF working group meeting. My notes:
[6:21 PM]
People are VERY positive about this and really see the need. This will happen but we have some work to do. 
[6:22 PM]
Multiple folks want a few additional example of mmCIFs to understand how to work it into refinement. Paul Adams does not think that this is as simple as grouped refinement. 
[6:22 PM]
They also want to see if we can simplify the co-existence table to just be NOT. We all agreed there should not be times where we need ANDs. Additional examples should help with this. 
[6:24 PM]
People are also curious about code (and would like to see examples) to create the mmCIF files - I spoke that we are working on that with qFit, @Justin Biel has some CL, and at some point FVD group will have something. I also spoke about the Paul Emsley's solution until coot is re-written. 
Stephanie  [6:25 PM]

There is also a lot of concern about validation. I don't think this will hold us up but we do need to think about what these models passing through OneDep would look like & get on (which we are already planning on doing) better validation for ensemble models. 
Stephanie  [6:27 PM]

Additionally, a lot of talk about data out - both what we have discussed with Gemmi and visualization (pymol, coot, chimera). I think something we should be thinking of is how we can vibe code some visualization solutions (@Jaime Fraser???) and present them to folks. Again, I don't think this will prevent us from moving forward, but we do need to think about this. 
[6:29 PM]
Lastly, they want to engage with the 'ensemble modelers of EM' . No one could give me the names of the folks they wanted to talk with so we should just engage some friends. 
[6:30 PM]
We are looking to meet again in May/June. We really should be getting them code and examples as best we can in the next 2 weeks. I will ping FVD's group again for this. Pseudocode would also be great.
Stephanie  [7:48 PM]
I don't know how to get over the Paul Emsley it is going to take me 2 years to implement this problem...
[7:49 PM]Thank you all for coming on this crazy journey -at least we are learning a lot how to push along other things in the diffUSE purview
Justin Biel  [8:08 PM]
I feel like it will get better if we can get GEMMI on board. Then at least there are opportunities to have decent third-party work arounds.
Stephanie  [8:08 PM]
Agree - I liked the work around Clemens suggested 
Stephanie  [3:58 PM]
Hi Stephanie,

Thanks for sharing the proposal. It's clear you've spent effort exploring how best to represent heterogeneity. We would be happy to discuss approaches to representing heterogeneous models with you. That said, in its current form, some of the technical aspects are difficult for us to work with (details below, based on Oleg's and Pavel's feedback). With some additional clarification, the overall approach may become clearer.

The main challenge with the proposal is that several core examples don't currently hold together. For instance, in Example 1 the description of the hierarchy (fragment vs. EDO1, and EDO2/EDO3 branching from EDO1) does not match what is shown in Figure 1, and the mmCIF loops appear to encode yet another structure. Because these three representations are inconsistent, it becomes very difficult to understand what the intended representation actually is. Bringing the text, figures, and data representation into agreement would make a big difference here.

A similar issue comes up with the figures more generally. For example, the text references panels C and D in Figure 2 that are not present, and points to a supplementary file that isn't included. In addition, Example 2 seems very close to Example 1, so it's not clear what new scenario it is meant to demonstrate. Tightening up the figures, both in terms of correctness and in clearly illustrating distinct cases, would really help the document make its case.

There are also places where the choice of example may unintentionally weaken the argument. In particular, Figure 1 appears to include a ligand placed in a region without supporting density (no density for the 6-membered ring). Using a more physically realistic and defensible example would strengthen the proposal.

On the conceptual side, the current "coexistence table" is quite hard to interpret, and it's not obvious how one would use it to construct valid models..

Finally, it would help to more clearly position this work relative to what is already possible. For example, existing tools already handle occupancy refinement by defining relationships between atom groups (either inferred or specified), so it would be useful to spell out exactly what new capability is being proposed and why it is needed. One potential direction is to make these relationships more explicit and portable, but that idea would benefit from being clearly articulated.

Overall, it would be helpful to further refine the document so that each example is internally consistent, and the conceptual model is straightforward to interpret. This would make it much easier for us to follow the proposal and think about how it could be adopted.

We would be glad to set up a meeting once a revised description is available. If you're able to update the white paper in light of the questions and points we've raised, that will help make the discussion more focused and productive.

Looking forward to discussing it further, heterogeneous models are definitely something to be addressed in the future.

All the best,

DorotheeStephanie  [4:00 PM]
We spoke about that with Garib, Keitaro and Marcin. We were wondering about substantial changes in the proposal. I'll do my best to share comments, please correct if I was unclear with anything.

5) Let's consider only using usual alt codes, not the special _atom_site.pdbx_heterogeneity_id column.
It would be useful to have a table where alternate conformation networks will be defined (in terms of residue ranges).
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.label_alt_id
1 alpha   125 126 A A
2 alpha   225 235 B A
3 beta   125 126 A B
4 beta   555 540 C A
5 gamma   500 500 A A
6 delta   500 500 A B

6) The key is to define the parents/children in the _pdbx_heterogeneity_hierarchy table. Is there an example case which requires the _pdbx_state_coexistence table to be described? It should be clear just from the _pdbx_heterogeneity_hierarchy table so should be redundant, shouldn't it? If we could skip dealing with the _pdbx_state_coexistence, it could simplify the implementation in software. In the figures in the document, the tree representations are often based on exclusivity (e.g. Figure 1B) but it would be better to think in a hierarchic "heraldic?" tree - what is a parent/child of what.

loop_
_pdbx_heterogeneity_hierarchy.id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
1 LigandOrNot     alpha   .
2 LigandOrNot     beta   .
3 statesOfLigand   gamma   beta
4 statesOfLigand   delta   beta

The logic of both points mentioned has some similarity with the occupancy group definition in Refmac/Servalcat - as you probably spotted.

Best wishes,
MartinJustin Biel  [11:13 PM]
Here are the 4 example structures. 5E1N, 3NYD, and 6DMH all have only one NOT in the coexistence table for a specific severe clash. 3K0N did not require a coexistence table. The hierarchy group names are largely in the format of {chain}{res_num}{altloc} with _ separators, or a _to_ separator to indicate that the hierarchy group spans that range. Ligands and Waters have format: {chain}{res_num}{res_name}{altloc} to make clear that they are not protein. The chain B translation that happens in 3NYD I gave a custom name, because otherwise it would be way to long. There I grouped all sections that had the same translation feature into the same group rather than separating them by only contiguous backbone heterogeneity.
4 files 5E1N_hierarchy.cifPlain Text3NYD_hierarchy.cifBinary3K0N_hierarchy.cifPlain Text6DMH_hierarchy.cifPlain TextJustin Biel  [3:20 PM]
Conor's A71 example is interesting but is not a valid model. He is trying to have hierarchical states each with alternative conformations. His hierarchy states are based on bound / unbound structures which each have alternative conformations. I think it would be helpful to try to properly encode the A71 example. His latest example STEP_19F looks fine.
Stephanie  [3:29 PM]
I have not had a chance to look at his (making my way through your examples which look great thus far!). Are you saying the bound/unbound are two different models?
Justin Biel  [3:36 PM]
Here is his encoding of hierarchical states in the A71  example (attached image), and here is a snippet that shows that he sometimes has two sets of alternative conformations under the same heterogeneity id:
 ATOM   662  C  C   A LYS A 1 78  . . 4.47   7.665  7.118  0.25 14.68 ? ? ? ? ? ? 78  LYS A C   1 A
 ATOM   663  C  C   B LYS A 1 78  . . 4.47   7.665  7.118  0.25 14.68 ? ? ? ? ? ? 78  LYS A C   1 A
 ATOM   664  C  C   C LYS A 1 78  . . 4.453  7.657  7.057  0.25 13.57 ? ? ? ? ? ? 78  LYS A C   1 B
 ATOM   665  C  C   D LYS A 1 78  . . 4.453  7.657  7.057  0.25 13.57 ? ? ? ? ? ? 78  LYS A C   1 B
 ATOM   666  O  O   A LYS A 1 78  . . 3.821  8.465  7.797  0.25 14.55 ? ? ? ? ? ? 78  LYS A O   1 A
 ATOM   667  O  O   B LYS A 1 78  . . 3.821  8.465  7.797  0.25 14.55 ? ? ? ? ? ? 78  LYS A O   1 A
 ATOM   668  O  O   C LYS A 1 78  . . 3.737  8.483  7.628  0.25 13.51 ? ? ? ? ? ? 78  LYS A O   1 B
 ATOM   669  O  O   D LYS A 1 78  . . 3.737  8.483  7.628  0.25 13.51 ? ? ? ? ? ? 78  LYS A O   1 Bimage.png Justin Biel  [3:38 PM]
I think he just needs to break out the alternative conformations in Base and FragmentBound into substates for the protein heterogeneity, like he did for the fragment conformations.
Justin Biel  [3:46 PM]
Regarding my examples, I realize now that I could have handled the cases differently where there are both backbone NH hydrogens alt confs and the side chain heterogeneity that are not connected. My temporary scripts I was using to make the examples work on the residue level, so they couldn't help me encode the NH hydrogens to the previous group and the rest to a new set of hierarchy groups. Probably worth fixing manually to make our examples as clean as possible.
Justin Biel  [5:11 PM]
Fixed the 5E1N example here where some of the NH hydrogen atoms should have belonged to the previous group. The other three files did not have this issue.
5E1N_hierarchy_20250423.cif 

data_5E1N
# 
_entry.id   5E1N 
# 
_audit_conform.dict_name       mmcif_pdbx.dic 


Stephanie  [1:03 PM]
This hydrogen case (+/- splitting at the residue level) will also be a good example for refinement folks as that is usually where those get split.
Stephanie  [1:38 PM]
@Justin Biel These look great! Can you send them along to the gemmi crew with an explanation of the co-existence table and hydrogen issues?
Stephanie  [3:51 PM]
https://github.com/PDBeurope/SIFTS
PDBeurope/SIFTSStars14LanguagePythonAdded by GitHubArtem Kushner  [10:02 PM]
was added to #encoding by .Stephanie  [4:06 PM]
https://github.com/diff-use/mmcif_encoding
diff-use/mmcif_encodingExamples and descriptions related to mmcif Encoding of hierarchical heterogeneity.Stars1Last updated14 days agoAdded by GitHub[4:08 PM]First external submission: https://github.com/diff-use/diff-use.github.io/tree/main/_submissions/2026-06-04T11-56-30_elke-de-zitter
[4:11 PM]This is from Paul Adams at the last mmCIF working group meeting
PDF Heterogeneity-mmCIFwg-May-2026.pdfPDF[4:14 PM]https://pmc.ncbi.nlm.nih.gov/articles/PMC3322595/
PubMed Central (PMC)Towards automated crystallographic structure refinement with phenix.refinephenix.refine is a program within the PHENIX package that supports crystallographic structure refinement against experimental data with a wide range of upper resolution limits using a large repertoire of model parameterizations. This paper presents ...[4:15 PM]https://www.nature.com/articles/s42003-022-03575-7
NatureXtrapol8 enables automatic elucidation of low-occupancy intermediate-states in crystallographic studiesCommunications Biology - The software Xtrapol8 extracts low occupancy states and can thereby accelerate and facilitate data processing in kinetic, timeresolved and ligand-based crystallographic...Stephanie  [4:22 PM]
https://github.com/diff-use/pdbx_hierarchy
diff-use/pdbx_hierarchyTools for working with hierarchical heterogeneity mmcif modelsLanguagePythonLast updated7 days agoAdded by GitHubAndy Burnim  [4:42 PM]
Encoding Meeting
Jun 12, 2026
Attendees

Andy, Justin, Stephanie, Artie
Discussion
pdbx_hierarchy repo 
https://github.com/diff-use/pdbx_hierarchy

Core library generates examples from static PDB structures with multiple states via alt locs
Takes every contiguous alt loc group and assigns a unique ID, attached to base state in new format
New CLI branch (nearly tested): validate, add state, split state, reparent states, delete/modify commands
README now added to the repo
Next planned feature: clash detection to handle non-contiguous backbone heterogeneity and flag egregious clashes
Artie’s onboarding

Reading the proposal docs and reviewing the encoding Slack channel history
Also reading up on crystallography, DISCO, and related topics
Thinking about first-principles representation: tensors, GPUs, no legacy constraints from 50-year-old typewriter-era formats
mmCIF Working Group status

Group has been unresponsive for 5 to 6 weeks
In-person workshop this fall is looking increasingly unlikely; may slip to spring 2027
Goal: walk into that workshop with input from refinement groups on what the actual blockers are
Visualization vs. refinement encoding

Visualization tools are more forgiving because they do not compute on or modify structures
Refinement programs (e.g., Phenix) must update coordinates, B-factors, and occupancies against observed data
Phenix currently has no mechanism to represent inter-occupancy relationships in a hierarchy
No way to describe a tree where a parent has occupancy 0.5 and children each have 0.25
Dangling alt loc labels (e.g., label C with no prior residue match) drift in space without restraints
Current workaround: phantom residue at 0 occupancy with harmonic restraint, or force all residues to have the same number of states, which creates false redundancy
Strategy: parallel tracks

Track 1: continue engaging the mmCIF working group, keep the proposal ready
Track 2: sandbox encoding ideas in the dynamic PDB without waiting for approval
“We have more latitude to make mistakes than they do”
Interconverting between ensemble and multi-conformer models will expose limitations and guide better encoding
No single encoding strategy is expected to answer everything
Priority next steps (Justin)

Ensemble to multi-conformer conversion in the CLI, so any ensemble input (Sampleworks, MD, etc.) can be encoded
Hook into Sampleworks: flag to output both ensemble and hierarchical multi-conformer at end of run
Pre/post refinement or pre/post Coot workflow: how to update the hierarchy when a new alt loc is added manually
Action Items

Justin: finish CLI branch testing; share updated README
Stephanie: follow up with people who said they would submit heterogeneity examples but have not yet
Stephanie: follow up with Frank re. Paul and Coot integration discussion
Meet in two weeks 
Artie will be done with tubulin work in Heidelberg by July 19, back home June 22; will switch full gear into this project
Andy will set up repeating meetings the week of June 22 once Artie has more availability
diff-use/pdbx_hierarchyTools for working with hierarchical heterogeneity mmcif modelsStars1LanguagePythonAdded by GitHubAndy Burnim  [5:48 PM]
Sent @Justin Biel, @Artem Kushner, and Stephanie an invite to a biweekly encoding meeting. The next one will be encoding meeting for June 30 (Tuesday) 10am - 11am (PDT) / 1pm - 2pm (EDT) / 5pm - 6pm (UTC) / 6pm - 7pm (BST).

Add proposed agenda items to this thread. Right now:

Justin: finish CLI branch testing; share updated README
Stephanie: follow up with people who said they would submit heterogeneity examples but have not yet
Stephanie: follow up with Frank re. Paul and Coot integration discussion
Andy Burnim  [4:57 PM]
@here we are meeting tomorrow, please review open items and add any items you would like to discuss to this thread
Sent @Justin Biel, @Artem Kushner, and Stephanie an invite to a biweekly encoding meeting. The next one will be encoding meeting for June 30 (Tuesday) 10am - 11am (PDT) / 1pm - 2pm (EDT) / 5pm - 6pm (UTC) / 6pm - 7pm (BST).

Add proposed agenda items to this thread. Right now:

Justin: finish CLI branch testing; share updated README
Stephanie: follow up with people who said they would submit heterogeneity examples but have not yet

Posted in encoding | Jun 18th | View messageAndy Burnim  [7:47 PM]
Action items here, meeting minutes in thread. Please let me know if there are issues or amendments.

Justin: Finish CLI branch testing and share updated README 
Stephanie: Follow up with contributors who haven't submitted heterogeneity examples 
Stephanie: Follow up with Frank on Paul and Coot integration discussion 
Stephanie: Email Oleg about meeting the week of 27th July. Aim to whiteboard the occupancy constraint problem in person; explore whether grouped occupancy in Phenix is fixable or fundamentally blocked.
Artie: Share mmCIF visualization tool internally at Astera. Upload so the team can use it as both a storytelling tool and a foundation for further tooling.
Stephanie  [5:22 PM]
Sharing the mmCIF hierarchical encoder visualization @Artem Kushner made!!: mmcif-browser-2.vercel.app (edited) 
mmcif-browser-2.vercel.appmmCIF BrowserA navigable explorer for the PDBx/mmCIF dictionaryJaime Fraser  [6:10 PM]
for those looking to poke around - using the dict selector reveals some xamples to preload that are very cool :star-struck:
Screenshot 2026-07-03 at 12.09.09 PM.png Stephanie  [9:05 PM]
Yes, so cool! Between this and the CLI interface from @Justin Biel we are well on our way on the communication front. Now we just need to work on the modeling front


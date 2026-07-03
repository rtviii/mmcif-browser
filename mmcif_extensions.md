Ok so what i want to try to do further with this repo is start adding support for our proposed extensions of the mmcif format specified in `/Users/rtviii/dev/rtviii.github.io/posts/heterogeneity-proposal/_reconciliation-memo.md`. 

They don't bring anything qualitatively new to the functioning of the mmcif files and how they relate to each other, i just want to see what kind of facilities we can bring to visualize the new relationships....

How i imagine this working is we add the dropdown with mmcif dict "version" mods. I guess we are at version 50 or something right now -- that's the authoritative pdb dict.. This should still be the main mode, but we will produce a fork of this dict (just another in the repo next to it for now) that now contains the categories and plumbing described in the reconciliation memo and it will be avialable in the site with the correct categories connection (pdbx_alt groups and netwokrs and coexistence tables etc. linking correctly to atom sites and residues and all that). We will then "teach" molstar to visualize them so i can share this with colleague in an obvious and illustrative way...

Do you see any blockers or ambiguitities to this?? Let me know what u want tokfind out fro mme?


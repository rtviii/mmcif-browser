        

DAG-ish escape hatch...
```
            Ligand (.50)                          EDO1 (.50)
           /     |     \                         /     |     \
        .05     .15    .30                    .25     .05    .20
         /       |       \                     /       |       \
      EDO2     EDO3     none               EDO2      EDO3     none





      EDO2:  .05 + .25 = .30      <-- the one number _atom_site carries
      EDO3:  .15 + .05 = .20      <-- the one number _atom_site carries
```

Encoding via "species":
```
loop_
_pdbx_alt_groups.id
_pdbx_alt_groups.alt_group_id
_pdbx_alt_groups.auth_asym_id
_pdbx_alt_groups.auth_seq_id_start
_pdbx_alt_groups.auth_seq_id_end
_pdbx_alt_groups.label_alt_id
_pdbx_alt_groups.label_atom_id
1 Ligand A 501 501 A .
2 EDO1   A 501 501 B .
3 EDO2   A 502 502 C .
4 EDO3   A 502 502 D .
#
loop_
_pdbx_heterogeneity_hierarchy.alt_group_id
_pdbx_heterogeneity_hierarchy.coexistence_group_id
_pdbx_heterogeneity_hierarchy.parent_alt_groups_id
Ligand top_pocket .
EDO1   top_pocket .
EDO2   bot_pocket .
EDO3   bot_pocket .




#
loop_
_pdbx_het_species.id
_pdbx_het_species.cluster_id
_pdbx_het_species.occupancy
_pdbx_het_species.details
1 edo_site 0.05 'ligand bound, EDO2 below -- rare, the phenol ring crowds it'
2 edo_site 0.15 'ligand bound, EDO3 below'
3 edo_site 0.30 'ligand bound, bottom pocket empty'
4 edo_site 0.25 'EDO1 above, EDO2 below -- the majority species'
5 edo_site 0.05 'EDO1 above, EDO3 below'
6 edo_site 0.20 'EDO1 above, bottom pocket empty'

#
loop_
_pdbx_het_species_member.species_id
_pdbx_het_species_member.alt_group_id
1 Ligand
1 EDO2

2 Ligand
2 EDO3

3 Ligand

4 EDO1
4 EDO2

5 EDO1
5 EDO3

6 EDO1
```




Atom-wise escape hatch:
```
id alt_group_id auth_asym_id auth_seq_id_start auth_seq_id_end label_alt_id label_atom_id
1   seg1_B A 20 24 B ·
1   nextg A 25 25 . ·

1   nextG' A 26 26 . CA
1   nextG' A 26 26 . CB

1   nextG'' A 27 30 . .
1   nextG'' A 31 31 . CA
```



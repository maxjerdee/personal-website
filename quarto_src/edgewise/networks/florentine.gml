graph [
  directed 0
  licenseId "NOASSERTION"
  note "faction: each family's political party in 1434, from Padgett & Ansell's own Appendix B (Table B1). NOT the same as a community-detection split of this marriage network: Ginori and Pazzi were Medici partisans despite marrying outside the Medicean bloc, and three families are recorded as having split loyalties rather than being forced into one side or the other."
  author "John F. Padgett and Christopher K. Ansell"
  source "https://doi.org/10.1086/230190"
  layout "force"
  colorAttr "faction"
  labelAttr "label"
  edgeOpacity 0.233
  title "Florentine Families"
  sublabel "15 nodes &#183; marriage alliances"
  category "Social"
  order 7
  keyNodeShort "Family"
  keyNodeFull "Florentine family, colored by faction"
  keyEdgeShort "Marriage alliance"
  keyEdgeFull "A marriage tie between the two families"
  keyStyle "graphical"
  sizeScale 2.0
  node [ id 0  label "Medici"        group "0"  x 350  y 230  faction "Medici" ]
  node [ id 1  label "Albizzi"       group "1"  x 180  y 110  faction "Split loyalties" ]
  node [ id 2  label "Acciaiuoli"    group "0"  x 160  y 310  faction "Medici" ]
  node [ id 3  label "Barbadori"     group "0"  x 265  y 375  faction "Split loyalties" ]
  node [ id 4  label "Castellani"    group "1"  x 430  y 400  faction "Oligarch" ]
  node [ id 5  label "Peruzzi"       group "1"  x 545  y 345  faction "Oligarch" ]
  node [ id 6  label "Bischeri"      group "1"  x 555  y 200  faction "Oligarch" ]
  node [ id 7  label "Strozzi"       group "1"  x 490  y 105  faction "Oligarch" ]
  node [ id 8  label "Guadagni"      group "1"  x 330  y  75  faction "Oligarch" ]
  node [ id 9  label "Lamberteschi"  group "1"  x 210  y  60  faction "Oligarch" ]
  node [ id 10 label "Ginori"        group "1"  x 100  y 175  faction "Medici" ]
  node [ id 11 label "Salviati"      group "0"  x 155  y 395  faction "Split loyalties" ]
  node [ id 12 label "Pazzi"         group "1"  x  72  y 435  faction "Medici" ]
  node [ id 13 label "Ridolfi"       group "0"  x 395  y 305  faction "Medici" ]
  node [ id 14 label "Tornabuoni"    group "0"  x 305  y 175  faction "Medici" ]
  edge [ source 0  target 1  ]
  edge [ source 0  target 2  ]
  edge [ source 0  target 3  ]
  edge [ source 0  target 11 ]
  edge [ source 0  target 13 ]
  edge [ source 0  target 14 ]
  edge [ source 1  target 8  ]
  edge [ source 1  target 10 ]
  edge [ source 3  target 4  ]
  edge [ source 4  target 5  ]
  edge [ source 4  target 7  ]
  edge [ source 5  target 6  ]
  edge [ source 5  target 7  ]
  edge [ source 6  target 7  ]
  edge [ source 6  target 8  ]
  edge [ source 8  target 9  ]
  edge [ source 8  target 14 ]
  edge [ source 11 target 12 ]
  edge [ source 13 target 7  ]
  edge [ source 13 target 14 ]
]

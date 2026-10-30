# Neo-Tokyo Vertical Megastructure — Blender Handoff Pack

## Purpose
This package contains generated concept references, a technical handoff document, and a structured scene specification for another AI or 3D artist to build a Blender environment. The two source photographs are included in `source_references/`.

## Important interpretation
The generated images are **concept and construction references**, not verified renders of a single identical 3D scene. Independently generated views contain inevitable geometry variation. Use `scene_spec.json` and `BLENDER_HANDOFF.md` as the source of truth for dimensions, coordinates, module IDs, and material settings. Do not infer exact measurements from the generated images.

## Contents
- `renders/R01_main_concept_vertical.png` — mood and hero composition.
- `renders/R02_rotation_eight_view_sheet.png` — illustrative eight-angle coverage sheet; not a true validated turntable.
- `renders/R03_orthographic_top_view.png` — top-down radial layout reference.
- `renders/R03_orthographic_front_elevation.png` — monochrome elevation reference.
- `renders/R04_vertical_zone_triptych.png` — upper/middle/lower zone concept reference.
- `renders/R05A_upper_middle_city_concept.png` — detailed upper and central city mood reference.
- `renders/R05B_lower_infrastructure_detail.png` — lower-level infrastructure detail.
- `renders/R06_cutaway_and_spatial_studies.png` — cutaway and architectural breakdown reference sheet.
- `renders/R07_gray_clay_blockout_reference.png` — monochrome massing and arrangement reference.
- `renders/R08_modular_architecture_asset_sheet.png` — modular building and bridge examples.
- `renders/R09_small_architectural_elements_sheet.png` — stairs, bridges, pipes, vents, screens, rails, doors and antennae.
- `renders/R10_material_atlas.png` — eight PBR material-look references.

## Completion status of the 12 requested render categories
1. Main concept — generated.
2. Eight-angle coverage — generated as one reference sheet; not eight independently validated frames.
3. Orthographic views — top and front elevation generated. Back, left, right, and bottom views remain to be produced from the actual Blender scene.
4. Full vertical unwrap — partial: a three-zone triptych exists, but segment bounds are not rendered onto it.
5. Upper/middle/lower closeups — partial: upper/middle and lower images exist; create a dedicated upper-only close-up from the final Blender geometry.
6. Spatial scheme and sections — partial: top view and cutaway sheet exist; add dimensioned, labeled sections after blockout approval.
7. Blockout — concept blockout reference generated; it is detailed rather than a strict primitive-only blockout.
8. Modular building sheet — generated.
9. Small architectural element sheet — generated as a dedicated component sheet; exact orthographic views of the same Blender assets remain to be produced.
10. Material and lighting atlas — generated as a visual guide; numeric material values live in the JSON/Markdown.
11. Rotation verification — reference sheet generated; validation must be rerendered from the same Blender scene at exact azimuths.
12. Vertical motion verification — partial: triptych illustrates the zones; generate a same-camera sequence from Blender to validate continuity and seams.

## Recommended workflow
1. Create only the blockout using coordinates in the JSON.
2. Render exact top/front/left/right/back/bottom projections from Blender.
3. Check 360° coverage at 45° intervals and seam bands around each vertical module boundary.
4. Approve silhouettes and bridges before detailing.
5. Add facade modules and small details using instancing.
6. Apply PBR materials, then test Eevee and browser export.
7. Export GLB and verify it in the actual target browser renderer.

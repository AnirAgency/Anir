Anir — placeholder media for Phase 14 (showreel mosaic)

Put these in:  public/media/placeholder/

  tile-01..04.avif    800x600  landscape work tiles
  tile-05..08.avif    600x800  portrait work tiles
  showreel-poster.avif 1280x720 poster for the centre video
  showreel.mp4        1280x720, 8s, H.264, silent, loop-safe

These are placeholders. They are deliberately ugly, numbered, and labelled
ОРЛУУЛАХ so they cannot be mistaken for work. The production build must fail
if anything still references this folder.

They are grained on purpose: a flat panel encodes to about 4 kB and would make
the budget check meaningless. These compress like photographs, so the
below-the-fold media lane is tested at something close to real weight.

H.264, not AV1: AV1 hardware decode is not universal on budget Android, which
is most of the audience. Software decode on a mid-range phone costs more
battery and frames than the bytes AV1 would save at this size.

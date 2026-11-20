/*
  FONT MENU — the fonts readers can choose from.

  To add a font:
    1. Put the font file (.woff2 preferred; .ttf/.otf also work) in this folder.
    2. Add one line to the list below, e.g.
         { id: "cardo", label: "Cardo", family: "Cardo", file: "Cardo-Regular.woff2" },
       - id:     short name with no spaces (used in links, e.g. #font=cardo)
       - label:  what readers see in the menu
       - family: any name; it just has to be unique
       - file:   the file name in this folder
    3. Reload the page. (No rebuild needed.)

  A font with separate italic/bold files can list them all under "files"
  (see EB Garamond below). "style": "italic" on an entry makes that whole
  option render in italic.

  Junicode is always loaded as the fallback for medieval characters
  (ꝑ ꝓ ꝗ ⁊ ſ, combining marks…) that a chosen font may lack.
  Keep the licence of every font you add in fonts/licenses/.
*/
window.FONTS = [
  {
    id: "modern",
    label: "Modern (Source Serif 4)",
    family: "Source Serif 4",
    files: [
      { file: "SourceSerif4.woff2", weight: "200 900" },
      { file: "SourceSerif4-Italic.woff2", weight: "200 900", style: "italic" }
    ]
  },
  {
    id: "humanist",
    label: "Humanist roman (EB Garamond)",
    family: "EB Garamond",
    files: [
      { file: "EBGaramond.woff2", weight: "400 800" },
      { file: "EBGaramond-Italic.woff2", weight: "400 800", style: "italic" }
    ]
  },
  {
    id: "italic",
    label: "Humanist italic (EB Garamond Italic)",
    family: "EB Garamond",
    style: "italic",
    files: [
      { file: "EBGaramond-Italic.woff2", weight: "400 800", style: "italic" }
    ]
  },
  {
    id: "junicode",
    label: "Scholarly (Junicode)",
    family: "Junicode",
    files: [
      { file: "Junicode.woff2", weight: "300 700" },
      { file: "Junicode-Italic.woff2", weight: "300 700", style: "italic" }
    ]
  }
];

/* The family used for characters the chosen font lacks. */
window.FALLBACK_FONT = "Junicode";

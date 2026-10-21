# PHANGS Galaxy Manifold

Conceptualized by [John Wu](https://jwuphysics.github.io) and implemented by Claude Opus 5.5.

PHANGS Galaxy Manifold is a website for exploring nearby PHANGS galaxies alongside galaxy scaling relations. The reference background shows 657,057 galaxies from the SDSS Main Galaxy Sample. Each galaxy is a point in a space of 22 measured properties, e.g., stellar mass. The screen shows a two-dimensional linear projection of that space.

You can rotate the projection by hand, let it rotate on its own, or jump to a known view such as the mass-metallicity relation. Each jump is an animated rotation through the full space, so you can watch one relation turn into another.

## What you can do

- Open a PHANGS observation chip on the left to filter by survey, observation status or ALMA array configuration. Selections across surveys must all match.
- Toggle PHANGS points at the top of the observations rail. Size and MUSE controls appear in the plot only when their axes contribute to the view.
- Use the PHANGS image button beside Glow/Mosaic to replace galaxy markers with DSS tiles. Tiles follow the observation filters and plotted positions; click one to inspect it. The choice is included in shared links.
- Search PHANGS names or aliases in the header, then select a result to inspect it. Filtered galaxies and unavailable axis measurements are identified in the results.
- Open the labelled PHANGS information button for sample definitions and sources, or SDSS for the reference data, credits and shortcuts.
- Press Space to start or pause a slow random rotation.
- Open **Views** for all projections. There are 14 views, including the mass-metallicity relation (MZR), the fundamental metallicity relation (FMR), the star-forming main sequence, the mass-size relation, the edge-on fundamental plane, the BPT diagram, and the stellar-to-halo mass relation.
- Color the points by a third property or by a class. The classes are BPT class, central or satellite from the group catalog, and Galaxy Zoo morphology. The brightness of the plot shows how many galaxies are in each place, and the color shows their average value.
- Turn on the running medians. With a color property set, the page draws one median line for each quarter of that property.
- Turn on the literature relations. Each one appears only when the axes match its own axes.
- Draw a lasso around a group of galaxies. The group stays highlighted when you rotate or change views.
- Switch to mosaic mode. The plot is then covered with galaxy images, and each cell shows the most typical galaxy in that cell.
- Click a galaxy to see its image and where it falls in every property.
- PHANGS inspection includes morphology and recorded observation chips, expandable measurements, and DSS, DESI, SDSS, DR9, 2MASS, GALEX, AllWISE and XMM image layers. Coverage varies. PHANGS redshift is the signed approximation z ≈ vLSR/c from the catalogue systemic velocity, not a heliocentric SDSS redshift.
- Press the tighten button in the bottom bar to search for the x axis that gives the least scatter in y. Starting from the MZR on the PP04 metallicity scale, it finds an x axis of about log M★ − 0.52 log SFR.

## Data

The sample is every SDSS DR7 Main Galaxy Sample galaxy in the MPA-JHU DR8 catalog with extinction-corrected Petrosian r of 17.77 or brighter and redshift 0.005 to 0.30. `pipeline/REPORT.md` lists how many galaxies each cut removes.

The properties come from these sources:

- MPA-JHU DR8 (Kauffmann et al. 2003, Brinchmann et al. 2004, Tremonti et al. 2004, Salim et al. 2007) for stellar mass, star formation rate, metallicity, emission lines, Dn4000, HδA and dust. The two dust properties are the stellar attenuation A_V from the fit to the fiber continuum, and the Balmer decrement Hα/Hβ, which measures dust in the ionized gas.
- SDSS DR17 through the SkyServer SQL service for Petrosian sizes, magnitudes and axis ratios.
- The Lim et al. (2017) SDSS group catalog for group halo mass, central or satellite, and k-corrected g−r color. This catalog covers only the northern part of the SDSS footprint.
- ALFALFA α.100 (Haynes et al. 2018) for H I gas fractions of detected galaxies.
- Galaxy Zoo 1 (Lintott et al. 2008, 2011) for morphology.
- The Legacy Survey viewer's SDSS layer for the galaxy images.

`DESIGN.md` section 6 lists all 22 properties and how each one is computed. The page stores two metallicity scales. One is the MPA-JHU value (T04). The other uses the O3N2 line ratio (Pettini and Pagel 2004). The two scales give opposite signs for the dependence of metallicity on star formation rate at fixed mass, so the FMR view uses the PP04 scale.

The 24 literature relations are in `site/data/literature.json`. Each coefficient was checked against the arXiv source of its paper and converted to this sample's conventions (Kroupa IMF, H0 = 70, Petrosian r-band radii). `pipeline/LITERATURE.md` lists each equation, its source, and the conversions.

## Run it locally

```
python3 -m http.server 8000 -d site
```

Then open http://localhost:8000. The page needs a web server because browsers block `fetch()` for files opened straight from disk.

## Rebuild the data

### PHANGS comparison overlay

The PHANGS toggle shows all 118 entries in the supplied v1p6 sample table, including
possible targets. Hover for a name or click for properties and any unique SDSS
counterpart within 10 arcsec. Hover and click use the same image cards and inspector
as SDSS, defaulting to [DSS2 colour cutouts via CDS](https://alasky.cds.unistra.fr/hips-image-services/hips2fits).
The inspector also offers SDSS and DESI Legacy Imaging Surveys DR10/DR9 through
the [Legacy Survey viewer](https://www.legacysurvey.org/svtips/), with unavailable coverage labelled.
PHANGS property bars show percentiles relative to the SDSS background.
The header reports the visible PHANGS count. The on/off toggle is above the
observation chips. Size and MUSE comparison controls appear at the upper right
of the uncovered plot area only when their axes contribute to the view.
The inspector lists R90, R25, stellar effective radius and stellar scale length with
their supplied angular uncertainties and physical radii at the PHANGS distance.
Physical-size uncertainties combine angular and distance errors, assuming independence.
These definitions are kept separate from SDSS Petrosian R50.
Stellar mass, SFR, sSFR, H I fraction and stellar surface density are mapped to axes by default.
PHANGS surface density uses the total stellar mass divided by a circular area,
`Σ★ = props_mstar / (π R90_kpc²)`, with `size_r90` converted from arcsec to kpc
using the table distance. `logSigma` is log10 of this value in M☉ kpc⁻²;
112/118 galaxies have valid inputs. No enclosed-mass fraction or inclination
correction is applied. This differs from the SDSS definition `M★/(2π R50²)`;
hover cards and the inspector label the PHANGS estimate as R90-based.
The table supplies no R90 uncertainties, so no density uncertainty is estimated.
Choose **Size axis → NED r-band exponential Rₑ** to compare measured optical model
half-light sizes on the R50 axis. The controls, hover and inspector identify this
as a different size definition. NED's standardized diameter is divided by two,
then converted to kpc at the PHANGS distance. Among duplicate exponential fits,
the newest reference year is used (ties follow reference code and source row order).
Missing values remain missing; the mode is preserved in copied view links.
The observation rail uses the table’s survey statuses and instrument fields.
ALMA can be filtered to the recorded **12m + 7m + TP** or **7m + TP** array
combination; this does not guarantee complete spatial coverage. VLA and MeerKAT
use the H I instrument field. JWST and Chandra coverage is not recorded in this
table and is explicitly labelled as unavailable. Active filters are preserved in
copied view links. Selected PHANGS points take the survey color (cream for an intersection).
Markers fade when a required property is missing. PHANGS remains
separate from SDSS filters, selections and statistics. The two catalogues use
different measurement methods, with no calibration offsets applied here.

Rebuild this overlay independently, without network access or the original SDSS inputs:

```
python3 pipeline/export_phangs.py
python3 -m unittest discover -s pipeline -p 'test_*.py'
```

This requires NumPy and Astropy from the pipeline dependencies. It reads the FITS
table in `site/data_phangs/` and the committed SDSS coordinate arrays, and writes
`phangs.json` plus `sdss_matches.csv` for reviewing matches. Survey statuses refer
to the supplied table version, rather than current observing status.

To refresh the optional, referenced NED diameter records for all 118 entries:

```
python3 pipeline/fetch_phangs_ned.py
python3 pipeline/export_phangs.py
```

The NED step caches successful responses and preserves the band, diameter type,
reference and query URL. Optical model half-light sizes and isophotal diameters
are not silently substituted for Petrosian R50. The public snapshot is in
`site/data_phangs/ned_sizes.json`.
The snapshot retrieved on 2026-10-16 has responses for 115/118 galaxies and
r-band exponential half-light radii for 21. Queries for NGC 3059, NGC 4736 and
NGC 4781 remained unavailable after retries. These NED fit radii are a median
of about 0.20 times the PHANGS stellar effective radii in the overlapping set;
the comparison mode is opt-in and retains the distinct definitions and references.

PHANGS stellar effective radii and disk scale lengths are described in
[Leroy et al. (2021), section 4.4](https://arxiv.org/abs/2104.07739).
There is no universal R25-to-R50 conversion; even a pure exponential-disk
relation (Rₑ ≈ 1.68 scale lengths) does not reproduce SDSS Petrosian r-band sizes.

### MUSE nebular measurements

The PHANGS controls offer **Galaxy summaries**, **H II regions**, or **Both**.
Summaries are shown by default. Use **View PP04 mass–metallicity relation** to
compare metallicities on the same calibration as the SDSS PP04 axis.

The supplied internal MUSE v3 catalogue contains 31,497 nebulae in 19 galaxies.
The export selects the 23,244 entries with `HII_class_v3 == 1`; 23,237 satisfy
the PP04 range `−1 < O3N2 < 1.9`. The shared properties are PP04 O3N2 metallicity,
log [NII]/Hα, log [OIII]/Hβ and log Hα/Hβ. They use `*_FLUX` without internal
attenuation correction, with positive fluxes and uncertainties and S/N > 3 in
each required line. MUSE uncertainties are used without the SDSS rescaling.

Choose **Hα-weighted mean** or **Hα-weighted median** to summarize region values,
weighted by dust-corrected Hα luminosity. Means average the displayed logarithmic
values; weighted quantiles use the first value reaching the requested cumulative
weight. **Summed lines** instead sums the required line fluxes over a common
eligible set for each diagnostic, then calculates ratios and PP04 metallicity.
The PP04 validity cut is applied after summing, so valid line fluxes from regions
outside the individual PP04 range still contribute. These methods need not agree.

Galaxy details list contributing counts and weighted 16–84% region ranges.
These ranges describe population spread, not measurement uncertainty. Native
S-calibration metallicity, radial residual, nebular E(B−V), log q and Hα luminosity
are available in details. In summed-line mode their summaries remain explicitly
labelled Hα-weighted means. No S-calibration-to-T04 conversion or mapping of
nebular reddening to the stellar `A_V` axis is applied.

Summaries describe catalogued H II regions within the MUSE footprint, excluding
diffuse emission; they do not reproduce SDSS fibre apertures. Region points share
their host's stellar mass, total SFR and other global properties. Hover and click
identify the region and its host. Regions are suppressed on views using only global
properties. Display and summary choices are preserved in shared links.

Rebuild the small summary file and the separate, lazily loaded region file offline:

```
python3 pipeline/export_nebulae.py
python3 -m unittest discover -s pipeline -p 'test_export_nebulae.py'
node --test site/tests/
```

The exporter reads the supplied FITS catalogue and sample table, recording hashes
of these inputs, the column guide and the release README in `nebulae_summary.json`.
`nebulae_regions.json` is fetched only when regions are requested. Measurements
follow [Groves et al. (2023)](https://arxiv.org/abs/2301.03811) and the
[PP04 O3N2 calibration](https://arxiv.org/abs/astro-ph/0401128).

### SDSS background

The pipeline reads local catalogs through the `catalog` and `data` links in the project root, which point into `../sdss-predict-everything`. It also reads the Lim et al. (2017) files from `~/Dropbox/data/xSAGA/lim+2017/catalogs/`.

The Python environment is managed with [uv](https://docs.astral.sh/uv/). `pyproject.toml` and `uv.lock` pin Python 3.12 and the package versions, so Linux and macOS builds use the same code. `uv run` creates `.venv` on first use. This folder syncs through Dropbox, so after the first run mark `.venv` as ignored, or the Linux and macOS environments will overwrite each other: `xattr -w com.dropbox.ignored 1 .venv` on macOS, `attr -s com.dropbox.ignored -V 1 .venv` on Linux.

```
uv run pipeline/fetch_skyserver.py   # SkyServer queries, cached; rerun until it prints COMPLETE
uv run pipeline/build_catalog.py     # merge the catalogs and compute the properties
uv run pipeline/export_web.py all    # write site/data, check it, and write REPORT.md
uv run pipeline/thumbs.py all        # choose the 15,994 galaxies with images and make thumbnails
uv run pipeline/literature.py        # rebuild site/data/literature.json from cached sources
node --test site/tests/              # unit tests for the projection math and overlays
```

Every download is cached in `pipeline/cache/`, so a second run sends no requests.

## Deploy to GitHub Pages

The workflow in `.github/workflows/pages.yml` runs the unit tests and publishes `site/` on every push to `main`. In the repository settings, set the Pages source to "GitHub Actions". The generated data in `site/data` is committed, because the pipeline needs local catalogs that GitHub does not have. It is about 62 MB, and about 31 MB of that is thumbnails.

## Caveats

- The sample is flux limited, so faint galaxies are missing at high redshift. You can use the redshift filter to see this.
- The spectra come from 3 arcsec fibers. At different redshifts the fiber covers different parts of a galaxy, which affects metallicity, star formation rate and Dn4000.
- Petrosian R50 is smaller than the true half-light radius for concentrated galaxies.
- The H I fractions are for ALFALFA detections only. At fixed stellar mass, they are higher than for all galaxies.
- Lim et al. (2017) assign halo masses from a mass proxy of each group, so part of the stellar-to-halo mass relation comes from how the catalog was built.

## Plans

These are not built yet:

- Axes from a convolutional network's image features, reduced to a few dimensions with UMAP.
- An axis from The Sequencer (Baron and Ménard 2021) applied to the optical spectra.
- Axes based on the large-scale environmental graph's top eigenvalues.
- More axes showing standard morphology parmaeters beyond concentration like asymmetry/smoothness or Gini-M20.

The page reads its properties from `site/data/manifest.json`, so a new axis needs only a new data column and a manifest entry. The code handles up to 28 properties and has a group reserved for learned axes.

## Layout

```
DESIGN.md        the design and the data format that all the code follows
pipeline/        Python scripts that build site/data
site/            the website (plain JavaScript modules and WebGL2, no build step)
site/data/       the generated data
tools/           the synthetic test data generator
```

## NGC 628 interactive HiPS test

Select NGC628 to automatically show the static survey and an interactive
JWST F770W map side by side in a wider inspector. See [the generation instructions](tools/phangs_hips/README.md)
for rebuilding the JPEG tiles from the local science FITS file.

## Additional ALMA surveys and property tags

The supplied `site/data_phangs/Galaxy Morph Overview - morphclass.csv` augments
79 catalogue galaxies, matched by name or recorded alias. Rebuild with
`uv run pipeline/export_phangs.py`. The export retains the CSV filename, hash,
and original membership/classification values; blank cells remain unrecorded.

ALMA offers Data available, Nominal PHANGS (with array configurations), eCMZ
(18 galaxies), and ALMOND (25 galaxies). Telescope selections intersect. Release
stages are not selectable. Availability uses recorded completed observations or
membership in the supplied survey list; no new release state is inferred.

Galaxy tags include Gleis+26 rings, Evans+26 MW-like galaxies (parenthesised
entries are tentative), AGN flags from the Véron/Asmus columns, and original
Véron nuclear-class codes where recorded in PHANGS v1p6.

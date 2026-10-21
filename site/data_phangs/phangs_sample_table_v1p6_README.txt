PHANGS SAMPLE TABLE README

VERSION: v1p6

This table provides survey coordinates, orientations, and some basic
physical parameters for current and possible targets of PHANGS
surveys, including PHANGS-ALMA, PHANGS-HST, and PHANGS-MUSE.

-------------------
FORMAT
-------------------

As of v1p5 (and v2p0) full release, the sample table is constructed by
a network of astropy programs and built as an astropy table. Then it
is written as an ecsv file and a FITS table. The metadata includes
units, though a few unit types may not work with FITS. Most common
astronomy languages include ways to read either FITS binary tables or
ecsv, but if other formats are desired please request them.

-------------------
VERSIONING
-------------------

The sample table is versioned independent of data releases, but we
should be clear about which version of the sample table a data release
uses.

E.g., The version 4 PHANGS-ALMA release will probably the version
"2p0" sample table.

Similar to the ALMA scheme, provisional releases (for comment and with
incremental changes) will be labeled 1p1, 1p2, etc. and major
releases, maintained for backwards compatibility, will be 1p0, 2p0,
etc. It will be expected that v3 or v4, e.g., has more fields than v2.

The first full release on the python-only version will be v2p0.

-------------------
FEEDBACK
-------------------

Right now the overall sample table is maintained by Tom Williams
(williams@mpia.de), who also is currently overseeing the data
status page that feeds the "survey" fields.

Individual fields and surveys are maintained by individual
contributors. See below or on the Google spreadsheet for the data
status page.

Feedback by email is okay, but opening an issue on the phangs_sample
repository is the ideal way to give feedback. There is also a
sample_table slack channel.

--------------------------------------
DESCRIPTION OF INDIVIDUAL QUANTITIEs
--------------------------------------

The rest of this README includes notes describing individual
quantities or groups of quantities in the sample table.

IDENTIFIERS: 

The table includes columns for a 'name', 'pgc', and a list of
semicolon-delimited aliases ('alias'). The accompanying module can
look up a galaxy in the table given any of these aliases (the
'row_for_gal') routine.

DISTANCE:

The table include distances, which are from Anand+ (2020. Uncertainties
are recorded in dex (be careful of this) and a quality (TRGB, QUALITY,
etc.) is recorded for each distance.

ORIENTATION: 

Position (RA center, Dec center, systemic velocity) and orientation
(position angle and inclination) on the sky of each galaxy. Current
preference is given to rotation curve based orientations (esp. Lang,
Meidt et al. 2020) and near-infrared photometric centers.

ROTATION CURVES

Analytic fit parameters for the rotation curves. These allow a
galactocentric radius to be translated to a predicted circular
rotation. Currently these are based on simple fits to rotation curve
models from Lang, Meidt et al. 2020. The sample_tab_utils module has
functions for expanding these and calculating their derivatives.

INTEGRATED PROPERTIES

Star formation rate, stellar mass, integrated gas masses, and offset
from the main sequence. The integrated HI masses are from the
literature, the H2 masses are from PHANGS with an aperture correction.

The SFR and Mstar values are from Leroy+ (in prep.), and are based on
WISE and GALEX measurements . The advantage is that these on an
understood can be readily compared to large samples (the full z0mgs
or the even larger GSWLC/SDSS sample from Salim et al.).

There is a lot to be written here on details of physical parameter
estimation that goes beyond the scope of a README file.

METALLICITY

Metallicity at the effective radius, r_eff, currently predicted from a
scaling relation (Sanchez et al. 2019) and on the PP04 oxygen scale.

MORPHOLOGY:

Morphological properties and features (e.g. rings, bars). Most of
these are taken from various S4G papers (Buta+ 2015, Herrera-Endoqui+ 2015, Salo+ 2015),
with some edits from Miguel Querejeta. There are also flags for the presence of these
features, as well as spiral arms, and VCC membership.

AGN:

Veron Cetty 13th edition
Paper in ads: https://ui.adsabs.harvard.edu/abs/2010A%26A...518A..10V/abstract
Read-me file: https://cdsarc.unistra.fr/ftp/VII/258/ReadMe

Classification:
     Q2 : type-2 quasar
     S1 : Seyfert 1 spectrum
     S1h: broad polarized Balmer lines detected
     S1i: broad Paschen lines observed in the infrared
     S1n: narrow-line Seyfert 1
     S1.0, S1.2, S1.5, S1.8, S1.9: intermediate Seyfert galaxies
     S2 : Seyfert 2 spectrum
     S2?: probable Seyfert 2
     S3 : Seyfert 3 or liner
     S3b: Seyfert 3 or liner with broad Balmer lines
     S3h: Seyfert 3 or liner with broad polarized Balmer lines detected
     S  : unclassified Seyfert
     S? : possibly a Seyfert
     H2 : nuclear HII region
     HP : high optical polarization (>3%)
     BL : confirmed BL Lac object
     BL?: probable BL Lac object
     ?  : questionable BL Lac object

Milliquas 2019:
Paper in ads: https://ui.adsabs.harvard.edu/abs/2019arXiv191205614F/abstract
Read-me file: http://quasars.org/Milliquas-ReadMe.txt
Classification:
     Q = QSO, type-I broad-line core-dominated, 722595 of these.
     A = AGN, type-I Seyferts/host-dominated, 36313 of these.
     B = BL Lac object, 2814 of these.
     q = photometric quasar candidate from SDSS or WISE, 1105991 of these.
         ~1K are SDSS/LAMOST pipeline QSOs w/o subclass, with R/X associations.
     L = lensed quasar extra image, only 63 of these in this optical data.
     K = NLQSO, type-II narrow-line core-dominated, 5490 of these.
     N = NLAGN, type-II Seyferts/host-dominated, 31691 of these.  Includes an
              unknown number of legacy NELGs/ELGs/LINERs for completeness.
     G = galaxy with double radio lobes (so calculated), 3947 of these.
     R = radio association displayed.
     X = X-ray association displayed.
     2 = double radio lobes displayed (declared by data-driven algorithm).
pQSO:  (percent chance that it is a QSO) based on photometric and/or radio/X-ray association analysis (unless double radio lobes are present). For a fully classified object (class starting with Q/A/B/K/N/L/G), this shows the percent chance that the shown radio/X-ray detection(s) is truly associated to it.
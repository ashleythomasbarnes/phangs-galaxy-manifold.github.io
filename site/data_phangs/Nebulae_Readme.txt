V3 nebular catalog
Kathryn Kreckel
November 2022

In preparation of the nebular catalog paper, a few minor issues were identified in the nebular catalog v2 and are now fixed in v3. This release does NOT rederive the spectra and does NOT redo the DAP fits to the lines. In that sense, the spectra and images associated with the v2 release are not updated and are identical to what is in the v2 directory. 

The spatial masks are also identical to what was included with v2

V3 of the nebular catalog has only minor changes from v2 and retains almost all of the original columns and column names for easy backward compatibility.

Code to produce v3 is in the ionized ISM SWG directory: 
https://drive.google.com/drive/folders/1puDscJhmtx6kYisDoL_pugtGUkg5yfXs?usp=share_link
File link:
https://colab.research.google.com/drive/1xInyssW9OPtHzYfFnjwW95Q1qZfusBj7?usp=share_link

Change list:
We change the r_eff scale length of NGC 1365, as r_eff in the sample table is biased by the AGN. Instead we used the scale length from the sample table scaled by 1.41 (Leroy+2021)
Bug fixed in 5thNN_dist, (rescaled by hiicat['pc_per_pixel']**2)
Bug fixed in deprojected distances, so that deproj_dist and  r_R25 and r_reff agree
EW(Ha)_raw added (based on Westfall+2019 emission line moment definition)
EW(Ha)_fit added (where the emission line is measured after subtracting the stellar continuum fit)
EW(Ha)_bgcorr added (based on Scheuermann+2023, which estimates and subtracts a stellar background contribution from the old stellar disk)
Metallicity errors updated to Monte Carlo derived errors from Ema
Radial metallicity fits calculated now in r_eff units, delta_met_scal rederived (minor changes, only ~5% change by more than 0.01 dex). 


For the public catalog the following changes are made:
The public release has had columns removed compared to the corresponding internal release (v3). Most importantly: auroral line fluxes and electron temperatures. 

A full list of additional columns removed:
Cen_x, Cen_y, cen_x_geo, cen_y_geo
flag_nearby
region_circ_rad
HII_class
LOG_SIGMA_SFR_CHAB
LOG_SIGMA_STMASS_CHAB
NN_number
Pc_per_pixel

Additional changes between the internal and public catalogs:
EBV converted to Av
Logq converted to logU


With Groves et al. 2023 we will release:
Public version of the Catalog, fits file
Spatial Maps for nebular catalog (these are on a pixel grid matched to the public data release)

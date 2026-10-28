/* Sotrama Bamako - ads (AdMob) and the "remove ads" purchase.
 * In a web browser none of this is available: the game simply hides the ad buttons.
 * In the Android / iOS app (Capacitor), the AdMob plugin and the purchase plugin are used.
 *
 * BEFORE PUBLISHING: replace the Google TEST ids below by your own ids from https://admob.google.com
 * and create the product "remove_ads" in Google Play Console and App Store Connect. */
(function () {
  "use strict";
  const SB = (window.SB = window.SB || {});

  const CONFIG = {
    testing: true, // set to false once your own ad units are in place
    android: { rewarded: "ca-app-pub-3940256099942544/5224354917", interstitial: "ca-app-pub-3940256099942544/1033173712" },
    ios: { rewarded: "ca-app-pub-3940256099942544/1712485313", interstitial: "ca-app-pub-3940256099942544/4411468910" },
    removeAdsProduct: "remove_ads",
  };

  const cap = () => window.Capacitor;
  const platform = () => (cap() && cap().getPlatform ? cap().getPlatform() : "web");
  const admob = () => (cap() && cap().Plugins ? cap().Plugins.AdMob : null);
  let ready = false, noAds = false;

  const ads = {
    async init(state) {
      noAds = !!state.noAds;
      const A = admob();
      if (!A || platform() === "web") return;
      try {
        await A.initialize({ initializeForTesting: CONFIG.testing });
        // European users must give their consent before personalised ads (GDPR)
        try {
          const info = await A.requestConsentInfo();
          if (info && info.isConsentFormAvailable && info.status === "REQUIRED") await A.showConsentForm();
        } catch (e) { /* consent form not configured yet in AdMob */ }
        ready = true;
      } catch (e) { ready = false; }
      purchases.init();
    },
    // rewarded ads stay available even after "remove ads": the player chooses to watch them
    rewardedAvailable() { return ready; },
    async showRewarded() {
      const A = admob(); if (!ready || !A) return false;
      const ids = CONFIG[platform()] || CONFIG.android;
      try {
        await A.prepareRewardVideoAd({ adId: ids.rewarded, isTesting: CONFIG.testing });
        const reward = await A.showRewardVideoAd();
        return !!reward;
      } catch (e) { return false; }
    },
    async showInterstitial() {
      const A = admob(); if (!ready || !A || noAds) return;
      const ids = CONFIG[platform()] || CONFIG.android;
      try { await A.prepareInterstitial({ adId: ids.interstitial, isTesting: CONFIG.testing }); await A.showInterstitial(); } catch (e) { /* no ad to show */ }
    },
    setNoAds(v) { noAds = !!v; },
  };

  /* In-app purchase "remove_ads" with cordova-plugin-purchase (works inside Capacitor). */
  const purchases = {
    available: false,
    onOwned: null,
    init() {
      const P = window.CdvPurchase; if (!P) return;
      const { store, ProductType, Platform } = P;
      const plat = platform() === "ios" ? Platform.APPLE_APPSTORE : Platform.GOOGLE_PLAY;
      store.register([{ id: CONFIG.removeAdsProduct, type: ProductType.NON_CONSUMABLE, platform: plat }]);
      store.when().approved((t) => t.verify()).verified((r) => r.finish()).finished(() => this.check());
      store.initialize([plat]).then(() => { this.available = true; this.check(); });
    },
    check() {
      const P = window.CdvPurchase; if (!P) return;
      if (P.store.owned(CONFIG.removeAdsProduct)) { ads.setNoAds(true); if (this.onOwned) this.onOwned(); }
    },
    price() {
      const P = window.CdvPurchase; if (!P || !this.available) return "";
      const p = P.store.get(CONFIG.removeAdsProduct);
      return p && p.pricing ? p.pricing.price : "";
    },
    buy() {
      const P = window.CdvPurchase; if (!P || !this.available) return;
      const p = P.store.get(CONFIG.removeAdsProduct); const offer = p && p.getOffer();
      if (offer) offer.order();
    },
    restore() { const P = window.CdvPurchase; if (P && this.available) P.store.restorePurchases(); },
  };

  SB.ads = ads;
  SB.purchases = purchases;
  SB.isApp = () => platform() !== "web";
})();

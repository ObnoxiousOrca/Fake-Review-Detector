(() => {
  const BADGE_CLASS = "rrc-badge";
  const DONE = "data-rrc-processed";
  const SELECTORS = [
    '[data-review-id]', '[data-testid*="review"]', '[class*="review"]',
    '[itemprop="review"]', 'article'
  ];
  const GOOGLE_REVIEW_TEXT_SELECTOR = ".d83Iyc";
  const IS_GOOGLE = /(^|\.)google\.[a-z.]+$/i.test(location.hostname);
  const seen = new WeakSet();
  const loggedReviews = new WeakSet();
  let loggedReviewCount = 0;
  let loggedApiError = false;
  let enabled = true;
  let timer = null;

  chrome.storage.sync.get({enabled:true}, data => { enabled=data.enabled; if(enabled) scan(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if(area==="sync" && changes.enabled){enabled=changes.enabled.newValue;if(enabled)scan();else removeBadges();}
  });

  function reviewText(el, googleReview = false) {
    if (googleReview) {
      const body = el.matches(GOOGLE_REVIEW_TEXT_SELECTOR)
        ? el.cloneNode(true)
        : el.querySelector(GOOGLE_REVIEW_TEXT_SELECTOR)?.cloneNode(true);
      if (!body) return "";
      body.querySelectorAll('button, [role="button"], .FrlmTe').forEach(control => control.remove());
      return (body.innerText || body.textContent || "").trim();
    }
    return (el.innerText || "").trim();
  }
  function likelyReview(el, googleReview = false) {
    if(!el || el.closest(".rrc-badge")) return false;
    const text=reviewText(el, googleReview);
    if(text.length<(googleReview ? 1 : 35) || text.length>5000) return false;
    // Avoid treating a whole page/container as a review.
    if(!googleReview && el.children.length>12) return false;
    return true;
  }
  function candidates() {
    const found=new Set();
    if(IS_GOOGLE) {
      document.querySelectorAll(GOOGLE_REVIEW_TEXT_SELECTOR).forEach(el => {
        if(likelyReview(el,true)) found.add(el);
      });
      return [...found];
    }
    for(const selector of SELECTORS) {
      document.querySelectorAll(selector).forEach(el=>{
        if(likelyReview(el)) {
          // Prefer the smallest matching review-like element.
          const child=[...el.children].find(c=>likelyReview(c));
          found.add(child||el);
        }
      });
    }
    return [...found].filter(el=>!([...found].some(other=>other!==el && other.contains(el) && (other.innerText||"").length>(el.innerText||"").length*1.4)));
  }
  function extractRating(el) {
    const ratingEls=el.querySelectorAll('[itemprop="ratingValue"],[aria-label*="star" i],[aria-label*="rating" i]');
    for(const ratingEl of ratingEls) {
      const raw=ratingEl.getAttribute("content")||ratingEl.getAttribute("aria-label")||ratingEl.getAttribute("title")||ratingEl.textContent;
      const m=String(raw).match(/\d+(?:\.\d+)?/);
      if(m) return Number(m[0]);
    }
    return undefined;
  }
  function addBadge(el, result) {
    let badge=el.querySelector(":scope > ."+BADGE_CLASS);
    if(!badge){badge=document.createElement("span");badge.className=BADGE_CLASS;el.appendChild(badge);}
    const score=Number(result.score);
    badge.textContent=`${score.toFixed(1)} • ${result.label}`;
    badge.dataset.score=result.score;
    badge.title=(result.explanation_cues||[]).join(", ")+" — estimate only";
    const scoreClasses=["rrc-mlh","rrc-probh","rrc-posb","rrc-posf","rrc-probf","rrc-mlf"];
    const scoreClass=score>=8.5 ? "rrc-mlh"
      : score>=7 ? "rrc-probh"
      : score>5 ? "rrc-posb"
      : score===5 ? null
      : score>4 ? "rrc-posf"
      : score>=2 ? "rrc-probf"
      : "rrc-mlf";
    badge.classList.remove(...scoreClasses);
    if(scoreClass) badge.classList.add(scoreClass);
    el.classList.add("rrc-review-host");
  }
  async function score(el) {
    if(seen.has(el) || el.hasAttribute(DONE)) return;
    const text=reviewText(el, IS_GOOGLE);
    if(text.length<(IS_GOOGLE ? 1 : 35))return;
    if(loggedReviewCount<5 && !loggedReviews.has(el)) {
      loggedReviews.add(el);
      loggedReviewCount++;
      console.log(`[Review Reality Check] Extracted review; class: ${el.className} ${loggedReviewCount}:`,text);
    }
    seen.add(el);el.setAttribute(DONE,"1");
    try {
      const response=await chrome.runtime.sendMessage({
        type:"rrc:predict",
        review:{text,rating:extractRating(el)}
      });
      if(response?.error) throw new Error(response.error);
      if(!response?.result) throw new Error("Prediction service returned no result");
      addBadge(el,response.result);
    } catch(e) {
      el.removeAttribute(DONE); seen.delete(el);
      if(!loggedApiError) {
        loggedApiError=true;
        console.error("[Review Reality Check] Could not reach prediction API:",e);
      }
    }
  }
  function scan(){if(!enabled)return;candidates().forEach(score);}
  function removeBadges(){document.querySelectorAll("."+BADGE_CLASS).forEach(b=>b.remove());document.querySelectorAll(".rrc-review-host").forEach(e=>e.classList.remove("rrc-review-host"));}
  const observer=new MutationObserver(()=>{if(!enabled)return;clearTimeout(timer);timer=setTimeout(scan,450);});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  scan();
})();

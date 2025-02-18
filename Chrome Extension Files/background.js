

// background.js
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: {tabId: tab.id},
    function: analyzePrivacyPolicy
  });
});

function analyzePrivacyPolicy() {
  const privacyKeywords = {
    "good": ["encrypted", "protected", "GDPR", "CCPA"],
    "bad": ["sell data", "third-party", "tracking", "advertisers"]
  };

  let bodyText = document.body.innerText.toLowerCase();
  let goodScore = privacyKeywords.good.filter(word => bodyText.includes(word)).length;
  let badScore = privacyKeywords.bad.filter(word => bodyText.includes(word)).length;
  
  let rating = "Neutral";
  if (goodScore > badScore) rating = "Good Privacy";
  if (badScore > goodScore) rating = "Poor Privacy";
  
  alert(`Privacy Rating: ${rating}\nGood Mentions: ${goodScore}\nBad Mentions: ${badScore}`);
}

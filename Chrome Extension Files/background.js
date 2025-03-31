

// background.js
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: {tabId: tab.id},
    function: analyzePrivacyPolicy
  });
});

function analyzePrivacyPolicy() {
  const privacyKeywords = {
    "good": [
      "encrypted", "protected", "GDPR", "CCPA", "data protection", "privacy policy", 
      "user consent", "no third-party", "no tracking", "anonymized", "secure", "confidential"
    ],
    "bad": [
      "sell data", "third-party", "tracking", "advertisers", "data sharing", "cookies", 
      "personal information", "data collection", "profiling", "behavioral advertising", "data brokers"
    ]
  };

  let bodyText = document.body.innerText.toLowerCase();
  let goodScore = privacyKeywords.good.filter(word => bodyText.includes(word)).length;
  let badScore = privacyKeywords.bad.filter(word => bodyText.includes(word)).length;

  // Calculate total score out of 100
  let totalScore = (goodScore - badScore) * 10;
  if (totalScore > 100) totalScore = 100;
  if (totalScore < 0) totalScore = 0;

  let rating = "Neutral";
  if (totalScore > 70) rating = "Excellent Privacy";
  else if (totalScore > 40) rating = "Good Privacy";
  else if (totalScore > 20) rating = "Fair Privacy";
  else rating = "Poor Privacy";

  alert(`Privacy Rating: ${rating}\nTotal Score: ${totalScore}\nGood Mentions: ${goodScore}\nBad Mentions: ${badScore}`);
}


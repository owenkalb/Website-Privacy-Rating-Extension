chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ai_analysis") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: analyzePrivacyPolicy
      });
    });
  } 
});

function analyzePrivacyPolicy() {
  const privacyKeywords = {
    good: ["encrypted", "protected", "gdpr", "ccpa", "no tracking", "anonymized", "secure"],
    bad: ["sell data", "third-party", "tracking", "advertisers", "data brokers"]
  };

  let bodyText = document.body.innerText.toLowerCase();
  let goodScore = privacyKeywords.good.filter(word => bodyText.includes(word)).length;
  let badScore = privacyKeywords.bad.filter(word => bodyText.includes(word)).length;

  let totalScore = 50 + (goodScore * 10) - (badScore * 10);
  totalScore = Math.max(0, Math.min(100, totalScore));

  let rating = totalScore > 70 ? "Excellent Privacy" :
               totalScore > 50 ? "Good Privacy" :
               totalScore > 30 ? "Fair Privacy" : "Poor Privacy";

  let explanation = "Privacy rating based on detected terms:\n";
  privacyKeywords.good.forEach(word => {
    if (bodyText.includes(word)) explanation += `+ ${word} detected\n`;
  });
  privacyKeywords.bad.forEach(word => {
    if (bodyText.includes(word)) explanation += `- ${word} detected\n`;
  });

  if (explanation === "Privacy rating based on detected terms:\n") explanation += "No relevant privacy terms detected.\n";

  chrome.runtime.sendMessage({
    result: `AI Privacy Rating: ${rating} (${totalScore}%)\n\n${explanation}`
  });
}

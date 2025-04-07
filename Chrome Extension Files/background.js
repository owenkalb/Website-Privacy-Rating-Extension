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

async function analyzePrivacyPolicy() {
  const apiKey = "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";
  const apiUrl = "https://openrouter.ai/api/v1/chat/completions";
  
  // Extract webpage text
  let bodyText = document.body.innerText.slice(0, 5000); // Limiting to first 5000 characters

  const requestBody = {
    model: "mistralai/mistral-7b-instruct:free", 
    messages: [
      { 
        "role": "system", 
        "content": "You are a privacy policy analyst. Your task is to rate a website's privacy practices objectively and critically, based on the content of the privacy policy. Use the following scoring rubric to assess the privacy policy:\n\n**Scoring Rules**:\n- Start at 10/10.\n- Subtract points for poor privacy practices (such as data sharing, tracking, lack of transparency, etc.).\n- Add points for good practices (such as strong encryption, clear opt-outs, no data sharing, etc.).\n- Adjust the score based on the overall strength and clarity of the privacy practices.\n\nProvide a rating and a summary that explains the score in a clear and concise manner.\n\nFormat your response exactly like this:\n\nRating: x/10\n\nGood:\n* [positive aspect]\n* [positive aspect]\n\nBad:\n* [negative aspect]\n* [negative aspect]\n\nSummary:\n[Short summary explaining the score. Be objective, concise, and avoid first-person language.]"
      },
      { 
        "role": "user", 
        "content": `Analyze the following privacy policy and provide a rating (1-10) based on privacy protection practices. Provide key insights based on the practices mentioned in the policy.\n\n**Privacy Policy to Analyze**:\n\n${bodyText}`
      }
    ],
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    let aiResponse = data.choices?.[0]?.message?.content || "Could not analyze the privacy policy.";

    // Send response back to popup.js
    chrome.runtime.sendMessage({ result: `Results For Webpage Privacy Rating:\n\n${aiResponse}` });

  } catch (error) {
    console.error("API Error:", error);
    chrome.runtime.sendMessage({ result: "Error: Unable to get a privacy rating." });
  }
}

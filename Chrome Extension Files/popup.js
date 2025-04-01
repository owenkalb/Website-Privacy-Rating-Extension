document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("aiButton").addEventListener("click", () => {
      let button = document.getElementById("aiButton");
      button.innerText = "Analyzing...";
      button.disabled = true;
      chrome.runtime.sendMessage({ action: "ai_analysis" });
    });
  
    chrome.runtime.onMessage.addListener((message) => {
      if (message.result) {
        document.getElementById("result").innerText = message.result;
        let button = document.getElementById("aiButton");
        button.innerText = "Website Analysis";
        button.disabled = false;
      }
    });
  });
  
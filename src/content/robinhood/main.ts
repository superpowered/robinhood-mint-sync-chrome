// Constants.
import { Message } from '../../constants/interfaces';
import { URLS } from "../../constants/urls";

// Utilities.
import { Overlay } from "../../utilities/overlay";
import { Debug } from "../../utilities/debug";

// -------------------------------------------------------------------------------

const debug = new Debug("content", "Robinhood - Main");

/**
 * Function to get the bearer token from the redux store on Robinhood. This will be used for the Robinhood API calls.
 */
const getBearerToken = () =>
  new Promise((resolve, reject) => {
    const database = window.indexedDB.open("localforage");
    database.onsuccess = () => {
      const transaction = database.result.transaction("keyvaluepairs", "readwrite");
      const objectStore = transaction.objectStore("keyvaluepairs");
      const auth = objectStore.get("reduxPersist:auth");

      auth.onsuccess = () => {
        try {
          const access_token = JSON.parse(auth.result).split(`access_token","`)[1].split(`"`)[0];
          resolve(access_token);
        } catch (error) {
          reject(error);
        }
      };
      auth.onerror = () => {
        reject(new Error("Failed to get reduxPersist:auth"));
      };
    };
    database.onerror = (e) => {
      reject(e);
    };
  });

/**
 * Function to scrape the portfolio and cash values
 */
const scrapeData = async () => {
  debug.log("Scraping data using Robinhood API");
  const returnValue = {
    event: "robinhood-portfolio-scraped",
  } as Message;

  try {
    const access_token = await getBearerToken();

    const response = await fetch(URLS.robinhood.api, {
      method: "GET",
      headers: new Headers({
        authorization: `Bearer ${access_token}`,
      }),
    });

    const json = await response.json();

    returnValue.debug = json;

    if (json && json.uninvested_cash && json.uninvested_cash.amount) {
      returnValue.uninvested_cash = json.uninvested_cash.amount;
    }

    if (json && json.crypto && json.crypto.equity && json.crypto.equity.amount) {
      returnValue.crypto = json.crypto.equity.amount;
    }

    if (json && json.equities && json.equities.equity && json.equities.equity.amount) {
      returnValue.equities = json.equities.equity.amount;
    }

    if (json && json.total_equity && json.total_equity.amount) {
      returnValue.total_equity = json.total_equity.amount;
    }

    // TODO: maybe there's an API for this?
    const accountName = document.querySelector(".main-container > h1") as HTMLElement;
    if (accountName && accountName.innerText) {
      returnValue.accountName = accountName.innerText;
    }

    return returnValue;
  } catch (error) {
    returnValue.error = error;
    console.error(error);
    return returnValue;
  }
};

/**
 * Initialize the content script on Robinhood
 */
const init = () => {
  new Overlay("Getting data from Robinhood...", "This window will automatically close when the sync is complete");
  const checkIfLoggedIn = async () => {
    debug.log("Waiting for page to load");
    if (document.location.pathname.includes("/account")) {
      clearInterval(checkIfLoggedInInterval);
      debug.log("Page loaded. Appears to be logged in.");
      const data = await scrapeData();
      debug.log("Scraped data", data);
      chrome.runtime.sendMessage(data);
    } else if (document.location.pathname.includes("/login")) {
      clearInterval(checkIfLoggedInInterval);
      debug.log("Page loaded. Appears to be logged out.");
      chrome.runtime.sendMessage({
        event: "robinhood-login-needed",
      });
    }
  };
  const checkIfLoggedInInterval = setInterval(checkIfLoggedIn, 500);
};

init();

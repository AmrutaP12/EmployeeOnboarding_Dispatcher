/**
 * Part 1 - Employee Data Retrieval and Prioritization
 * Compatible with:
 *   1. Local Node.js execution for testing
 *   2. AWS Lambda Node.js runtime
 *
 * Node.js 18+ is required because this file uses the built-in fetch API.
 */
import "dotenv/config";

const EMPLOYEE_API_URL =  process.env.EMPLOYEE_API_URL;

const QUEUE_NAME = process.env.UIPATH_QUEUE_NAME;

/**
 * Apply the business priority rules.
 * High   : salary > 300000
 * Normal : salary >= 100000 and salary <= 300000
 * Low    : salary < 100000
 */
function calculatePriority(salary) {
  const numericSalary = Number(salary);

  if (!Number.isFinite(numericSalary)) {
    throw new Error(`Invalid salary: ${salary}`);
  }

  if (numericSalary > 300000) {
    return "High";
  }

  if (numericSalary >= 100000) {
    return "Normal";
  }

  return "Low";
}

/**
 * Calls the employee API and returns a clean employee array.
 */
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchEmployees() {
  const maximumAttempts = 5;

  for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
    console.log(
      `Calling employee API. Attempt ${attempt} of ${maximumAttempts}...`
    );

    const response = await fetch(EMPLOYEE_API_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 EmployeeOnboardingDispatcher/1.0"
      }
    });

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("retry-after");

      const waitingSeconds = retryAfterHeader
        ? Number(retryAfterHeader)
        : attempt * 10;

      console.log(
        `API returned HTTP 429. Waiting ${waitingSeconds} seconds before retrying...`
      );

      await delay(waitingSeconds * 1000);
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `Employee API request failed. HTTP ${response.status} ${response.statusText}`
      );
    }

    const payload = await response.json();

    if (!payload || !Array.isArray(payload.data)) {
      throw new Error(
        "Employee API response does not contain a valid data array."
      );
    }

    return payload.data.map((employee) => {
      const cleanedEmployee = {
        id: String(employee.id ?? "").trim(),
        employee_name: String(employee.employee_name ?? "").trim(),
        employee_salary: Number(employee.employee_salary),
        employee_age: Number(employee.employee_age)
      };

      if (!cleanedEmployee.id) {
        throw new Error("An employee record has no ID.");
      }

      if (!cleanedEmployee.employee_name) {
        throw new Error(
          `Employee ${cleanedEmployee.id} has no name.`
        );
      }

      if (!Number.isFinite(cleanedEmployee.employee_salary)) {
        throw new Error(
          `Employee ${cleanedEmployee.id} has an invalid salary.`
        );
      }

      if (!Number.isFinite(cleanedEmployee.employee_age)) {
        throw new Error(
          `Employee ${cleanedEmployee.id} has an invalid age.`
        );
      }

      return cleanedEmployee;
    });
  }

  throw new Error(
    "Employee API continued returning HTTP 429 after all retry attempts."
  );
}

/**
 * Gets an OAuth token from UiPath.
 * This method will be used after UiPath External Application details are available.
 */
async function getUiPathAccessToken() {
  const tokenUrl = process.env.UIPATH_TOKEN_URL;
  const clientId = process.env.UIPATH_CLIENT_ID;
  const clientSecret = process.env.UIPATH_CLIENT_SECRET;
  const scope = process.env.UIPATH_SCOPE;

  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error(
      "UiPath authentication settings are missing. " +
      "Set UIPATH_TOKEN_URL, UIPATH_CLIENT_ID and UIPATH_CLIENT_SECRET."
    );
  }

  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `UiPath token request failed. HTTP ${response.status}. ${responseText}`
    );
  }

  const tokenPayload = JSON.parse(responseText);

  if (!tokenPayload.access_token) {
    throw new Error("UiPath did not return an access token.");
  }

  return tokenPayload.access_token;
}

/**
 * Adds one employee to the UiPath Orchestrator queue.
 */
async function addEmployeeToQueue(accessToken, employee) {
  const orchestratorBaseUrl = process.env.UIPATH_ORCHESTRATOR_URL;
  const folderId = process.env.UIPATH_FOLDER_ID;

  if (!orchestratorBaseUrl || !folderId) {
    throw new Error(
      "Set UIPATH_ORCHESTRATOR_URL and UIPATH_FOLDER_ID before queue upload."
    );
  }

  const priority = calculatePriority(employee.employee_salary);
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const reference = `Employee_${employee.id}_${datePart}`;

  const url =
    `${orchestratorBaseUrl.replace(/\/$/, "")}` +
    "/odata/Queues/UiPathODataSvc.AddQueueItem";

  const requestBody = {
    itemData: {
      Name: QUEUE_NAME,
      Priority: priority,
      Reference: reference,
      SpecificContent: {
        EmployeeID: employee.id,
        EmployeeName: employee.employee_name,
        EmployeeSalary: employee.employee_salary,
        EmployeeAge: employee.employee_age
      }
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-UIPATH-OrganizationUnitId": folderId
    },
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Queue upload failed for employee ${employee.id}. ` +
      `HTTP ${response.status}. ${responseText}`
    );
  }

  return {
    employeeId: employee.id,
    employeeName: employee.employee_name,
    priority,
    reference,
    status: "Added"
  };
}

/**
 * Main processing method.
 *
 * dryRun = true:
 *   Fetches employees and calculates priorities without calling UiPath.
 *
 * dryRun = false:
 *   Fetches employees and uploads them to the UiPath queue.
 */
async function runDispatcher(dryRun = true) {
  const employees = await fetchEmployees();

  const prioritizedEmployees = employees.map((employee) => ({
    ...employee,
    priority: calculatePriority(employee.employee_salary)
  }));

  const summary = {
    queueName: QUEUE_NAME,
    dryRun,
    totalEmployees: prioritizedEmployees.length,
    highPriority: prioritizedEmployees.filter((x) => x.priority === "High").length,
    normalPriority: prioritizedEmployees.filter((x) => x.priority === "Normal").length,
    lowPriority: prioritizedEmployees.filter((x) => x.priority === "Low").length,
    employees: prioritizedEmployees
  };

  if (dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }

  const accessToken = await getUiPathAccessToken();
  const queueResults = [];

  // Sequential calls are intentional for this small assessment dataset.
  for (const employee of prioritizedEmployees) {
    const result = await addEmployeeToQueue(accessToken, employee);
    queueResults.push(result);
  }

  return {
    ...summary,
    queueResults
  };
}

/**
 * AWS Lambda entry point.
 *
 * Test event for local-only validation:
 * { "dryRun": true }
 *
 * Real queue upload:
 * { "dryRun": false }
 */
export const handler = async (event = {}) => {
  try {
    const dryRun =
      event.dryRun !== undefined
        ? Boolean(event.dryRun)
        : process.env.DRY_RUN !== "false";

    const result = await runDispatcher(dryRun);

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error("Part 1 failed:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Part 1 employee dispatcher failed.",
        error: error.message
      })
    };
  }
};

// Allows local testing using: npm start
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runDispatcher(false).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

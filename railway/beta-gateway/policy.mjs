const connectorCreateV1 = /^\/account\/[^/]+\/connectors\/?$/;
const connectorUpdateV1 = /^\/account\/[^/]+\/connectors\/[^/]+\/?$/;
const connectorCreateV2 = /^\/v2\/connector-accounts\/?$/;
const connectorUpdateV2 = /^\/v2\/connector-accounts\/[^/]+\/?$/;
const paymentPath = /^\/(?:v2\/)?payments(?:\/|$)/;
const paymentMethodPath = /^\/(?:payment_methods|v2\/payment-methods)(?:\/|$)/;
const paymentMethodSessionPath = /^\/v2\/payment-method-sessions(?:\/|$)/;
const genericTokenizationPath = /^\/v2\/tokenize(?:\/|$)/;

const liveCredentialPattern = /(?:^|[^a-z0-9])(?:sk|rk|pk)_live_[a-z0-9]+/i;
const stripeTestKeyPattern = /^(?:sk|rk)_test_[A-Za-z0-9_]+$/;
const vgsSandboxAliasPattern = /^tok_sandbox_[A-Za-z0-9_-]+$/;
const paymentMutationMethods = new Set(["PATCH", "POST", "PUT"]);
const rawCardFieldNames = new Set([
  "application_primary_account_number",
  "card_cvc",
  "card_exp_month",
  "card_exp_year",
  "card_expiry_month",
  "card_expiry_year",
  "card_number",
  "raw_card_number",
]);
const fullVaultCardVariants = new Set([
  "proxy_card",
  "vault_card",
  "vault_data_card",
]);
const optionalCvcVaultCardVariants = new Set([
  "vault_card_token",
  "vault_card_token_data",
]);
const requiredCvcVaultCardVariants = new Set(["vault_token"]);

export function requestNeedsPolicyInspection(method, pathname) {
  const normalizedMethod = method.toUpperCase();

  return (
    isCardDataMutation(normalizedMethod, pathname) ||
    (normalizedMethod === "POST" &&
      (connectorCreateV1.test(pathname) ||
        connectorUpdateV1.test(pathname) ||
        connectorCreateV2.test(pathname))) ||
    (normalizedMethod === "PUT" && connectorUpdateV2.test(pathname))
  );
}

export function evaluateBetaPolicy(
  method,
  pathname,
  payload,
  { vgsEuSandboxEnabled = false, vgsEuSandboxVaultIds = [] } = {},
) {
  const normalizedMethod = method.toUpperCase();

  if (containsLiveCredential(payload)) {
    return reject(
      "beta_live_credential_blocked",
      "Live payment credentials are blocked in this sandbox beta.",
    );
  }

  if (isCardDataMutation(normalizedMethod, pathname)) {
    if (genericTokenizationPath.test(pathname)) {
      return reject(
        "beta_generic_tokenization_blocked",
        "Generic tokenization is blocked on the non-PCI gateway. Use a stored processor token or VGS Collect aliases.",
      );
    }

    if (containsProperty(payload, "merchant_connector_details")) {
      return reject(
        "beta_inline_credentials_blocked",
        "Inline connector credentials are blocked. Use a stored Stripe test connector.",
      );
    }

    if (containsRawCardData(payload)) {
      return reject(
        "beta_raw_card_data_blocked",
        "Raw card payloads are blocked. Use a stored processor token or VGS Collect aliases.",
      );
    }

    const externalVaultCards = findExternalVaultCards(payload);
    if (externalVaultCards.length > 0) {
      if (!vgsEuSandboxEnabled) {
        return reject(
          "beta_vgs_eu_not_enabled",
          "VGS EU sandbox aliases are blocked until the controlled rollout is activated.",
        );
      }

      if (externalVaultCards.some((entry) => !hasValidVgsAliases(entry))) {
        return reject(
          "beta_vgs_alias_required",
          "External-vault card fields must contain UUID-style VGS sandbox aliases; raw or format-preserving card values are blocked.",
        );
      }
    }

    return allow();
  }

  const isCreate =
    normalizedMethod === "POST" &&
    (connectorCreateV1.test(pathname) || connectorCreateV2.test(pathname));
  const isUpdate =
    (normalizedMethod === "POST" && connectorUpdateV1.test(pathname)) ||
    (normalizedMethod === "PUT" && connectorUpdateV2.test(pathname));

  if (!isCreate && !isUpdate) {
    return allow();
  }

  if (payload.test_mode === false) {
    return reject(
      "beta_test_mode_required",
      "Connector test_mode must remain enabled in this sandbox beta.",
    );
  }

  const connectorName = String(payload.connector_name ?? "").toLowerCase();

  if (connectorName === "vgs") {
    return evaluateVgsEuSandboxPolicy(payload, {
      isCreate,
      vgsEuSandboxEnabled,
      vgsEuSandboxVaultIds,
    });
  }

  if (
    hasOwn(payload, "connector_name") &&
    connectorName !== "stripe"
  ) {
    return reject(
      "beta_stripe_only",
      "Only Stripe test connectors can be created or reconfigured in this sandbox beta.",
    );
  }

  const hasAccountDetails = hasOwn(payload, "connector_account_details");

  if (isCreate || hasAccountDetails) {
    if (String(payload.connector_name ?? "").toLowerCase() !== "stripe") {
      return reject(
        "beta_stripe_only",
        "A Stripe connector_name is required when configuring test credentials.",
      );
    }

    if (payload.test_mode !== true) {
      return reject(
        "beta_test_mode_required",
        "Connector test_mode=true is required when configuring test credentials.",
      );
    }

    const apiKey = payload.connector_account_details?.api_key;
    if (typeof apiKey !== "string" || !stripeTestKeyPattern.test(apiKey)) {
      return reject(
        "beta_stripe_test_key_required",
        "A Stripe test secret beginning with sk_test_ or rk_test_ is required.",
      );
    }
  }

  return allow();
}

function evaluateVgsEuSandboxPolicy(
  payload,
  { isCreate, vgsEuSandboxEnabled, vgsEuSandboxVaultIds },
) {
  if (!vgsEuSandboxEnabled) {
    return reject(
      "beta_vgs_eu_not_enabled",
      "VGS EU sandbox is selected but not activated. Add the VGS EU sandbox account through the controlled rollout first.",
    );
  }

  if (String(payload.connector_type ?? "").toLowerCase() !== "vault_processor") {
    return reject(
      "beta_vgs_vault_processor_required",
      "VGS must be configured as connector_type=vault_processor.",
    );
  }

  const hasAccountDetails = hasOwn(payload, "connector_account_details");
  if (isCreate || hasAccountDetails) {
    if (payload.test_mode !== true) {
      return reject(
        "beta_test_mode_required",
        "Connector test_mode=true is required for the VGS EU sandbox.",
      );
    }

    const accountDetails = payload.connector_account_details;
    if (
      accountDetails === null ||
      typeof accountDetails !== "object" ||
      Array.isArray(accountDetails)
    ) {
      return reject(
        "beta_vgs_credentials_required",
        "VGS EU sandbox credentials must be supplied through connector_account_details.",
      );
    }

    if (accountDetails.auth_type !== "SignatureKey") {
      return reject(
        "beta_vgs_signature_key_required",
        "VGS requires connector_account_details.auth_type=SignatureKey.",
      );
    }

    const requiredFields = ["api_key", "key1", "api_secret"];
    if (
      requiredFields.some(
        (field) =>
          typeof accountDetails[field] !== "string" ||
          accountDetails[field].trim() === "",
      )
    ) {
      return reject(
        "beta_vgs_credentials_required",
        "VGS SignatureKey credentials require api_key, key1, and api_secret.",
      );
    }

    if (!vgsEuSandboxVaultIds.includes(accountDetails.api_secret)) {
      return reject(
        "beta_vgs_eu_vault_not_allowed",
        "The VGS vault ID is not in the verified EU sandbox allowlist.",
      );
    }
  }

  return allow();
}

function containsLiveCredential(value) {
  if (typeof value === "string") {
    return liveCredentialPattern.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsLiveCredential);
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value).some(containsLiveCredential);
  }

  return false;
}

function isCardDataMutation(method, pathname) {
  return (
    paymentMutationMethods.has(method) &&
    (paymentPath.test(pathname) ||
      paymentMethodPath.test(pathname) ||
      paymentMethodSessionPath.test(pathname) ||
      genericTokenizationPath.test(pathname))
  );
}

function containsProperty(value, property) {
  if (Array.isArray(value)) {
    return value.some((item) => containsProperty(item, property));
  }

  if (value !== null && typeof value === "object") {
    return (
      hasOwn(value, property) ||
      Object.values(value).some((item) => containsProperty(item, property))
    );
  }

  return false;
}

function containsRawCardData(value, skipExternalVaultVariants = true) {
  if (Array.isArray(value)) {
    return value.some((item) =>
      containsRawCardData(item, skipExternalVaultVariants),
    );
  }

  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        skipExternalVaultVariants &&
        (fullVaultCardVariants.has(key) ||
          optionalCvcVaultCardVariants.has(key) ||
          requiredCvcVaultCardVariants.has(key)) &&
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item)
      ) {
        continue;
      }

      if (rawCardFieldNames.has(key)) {
        return true;
      }

      if (containsRawCardData(item, skipExternalVaultVariants)) {
        return true;
      }
    }
  }

  return false;
}

function findExternalVaultCards(value, entries = []) {
  if (Array.isArray(value)) {
    for (const item of value) findExternalVaultCards(item, entries);
    return entries;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        fullVaultCardVariants.has(key) ||
        optionalCvcVaultCardVariants.has(key) ||
        requiredCvcVaultCardVariants.has(key)
      ) {
        entries.push({ data: item, variant: key });
      } else {
        findExternalVaultCards(item, entries);
      }
    }
  }

  return entries;
}

function hasValidVgsAliases({ data, variant }) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }

  const requiredFields = fullVaultCardVariants.has(variant)
    ? ["card_number", "card_exp_month", "card_exp_year", "card_cvc"]
    : requiredCvcVaultCardVariants.has(variant)
      ? ["card_cvc"]
      : [];

  if (requiredFields.some((field) => !isVgsSandboxAlias(data[field]))) {
    return false;
  }

  const optionalAliasesAreValid = ["card_cvc", "card_holder_name"]
    .filter((field) => hasOwn(data, field) && data[field] !== null)
    .every((field) => isVgsSandboxAlias(data[field]));

  if (!optionalAliasesAreValid) {
    return false;
  }

  const aliasFields = new Set([
    ...requiredFields,
    "card_cvc",
    "card_holder_name",
  ]);

  return !Object.entries(data).some(([field, value]) => {
    if (aliasFields.has(field)) {
      return value !== null && !isVgsSandboxAlias(value);
    }

    return rawCardFieldNames.has(field) || containsRawCardData(value, false);
  });
}

function isVgsSandboxAlias(value) {
  return typeof value === "string" && vgsSandboxAliasPattern.test(value);
}

function hasOwn(value, property) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, property)
  );
}

function allow() {
  return { allowed: true };
}

function reject(code, message) {
  return { allowed: false, code, message };
}

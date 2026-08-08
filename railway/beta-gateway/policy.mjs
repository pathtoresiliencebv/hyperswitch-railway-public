const connectorCreateV1 = /^\/account\/[^/]+\/connectors\/?$/;
const connectorUpdateV1 = /^\/account\/[^/]+\/connectors\/[^/]+\/?$/;
const connectorCreateV2 = /^\/v2\/connector-accounts\/?$/;
const connectorUpdateV2 = /^\/v2\/connector-accounts\/[^/]+\/?$/;
const paymentCreate = /^\/(?:v2\/)?payments\/?$/;

const liveCredentialPattern = /(?:^|[^a-z0-9])(?:sk|rk|pk)_live_[a-z0-9]+/i;
const stripeTestKeyPattern = /^(?:sk|rk)_test_[A-Za-z0-9_]+$/;

export function requestNeedsPolicyInspection(method, pathname) {
  const normalizedMethod = method.toUpperCase();

  return (
    (normalizedMethod === "POST" &&
      (connectorCreateV1.test(pathname) ||
        connectorUpdateV1.test(pathname) ||
        connectorCreateV2.test(pathname) ||
        paymentCreate.test(pathname))) ||
    (normalizedMethod === "PUT" && connectorUpdateV2.test(pathname))
  );
}

export function evaluateBetaPolicy(method, pathname, payload) {
  const normalizedMethod = method.toUpperCase();

  if (containsLiveCredential(payload)) {
    return reject(
      "beta_live_credential_blocked",
      "Live payment credentials are blocked in this sandbox beta.",
    );
  }

  if (paymentCreate.test(pathname) && normalizedMethod === "POST") {
    if (hasOwn(payload, "merchant_connector_details")) {
      return reject(
        "beta_inline_credentials_blocked",
        "Inline connector credentials are blocked. Use a stored Stripe test connector.",
      );
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

  if (
    hasOwn(payload, "connector_name") &&
    String(payload.connector_name).toLowerCase() !== "stripe"
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

/* True Auto Zim — port-aware landed-cost calculator + installment estimator
   (mirrors server pricing.py) */
document.addEventListener("DOMContentLoaded", () => {
  const model = Object.assign(
    {
      duty_rate: 0.25, surtax_rate: 0.10, vat_rate: 0.15,
      insurance_rate: 0.03, auction_fees: 300, port_handling: 250,
      clearing_fee: 350, inspection_fee: 50, transport_to_hre: 700,
      commission: 850, freight: 1400, ports: {}, default_port: "beira",
    },
    window.COST_MODEL || {}
  );

  const ports = model.ports || {};
  const $ = (id) => document.getElementById(id);
  const setMoney = (id, v) => { const el = $(id); if (el) el.textContent = fmtMoney(v); };

  const fobInput = $("calcFob");
  const portSel = $("calcPort");
  const freightInput = $("calcFreight");

  const currentPort = () => {
    const key = portSel ? portSel.value : (model.default_port || "");
    return (ports[key] || {});
  };

  const recalc = () => {
    const fob = parseFloat(fobInput.value) || 0;
    const port = currentPort();
    const usingPort = !!(portSel && portSel.value);
    const freight = usingPort
      ? (port.freight != null ? port.freight : model.freight)
      : (parseFloat(freightInput.value) || model.freight);
    const transport = usingPort && port.transport != null ? port.transport : model.transport_to_hre;
    const portName = usingPort ? port.label : "Custom route";

    const cif = fob + freight;
    const insurance = cif * model.insurance_rate;
    const duty = cif * model.duty_rate;
    const surtax = cif * model.surtax_rate;
    const vat = (cif + duty + surtax) * model.vat_rate;
    const clearing = model.clearing_fee + model.inspection_fee;
    const total = cif + insurance + duty + surtax + vat
      + model.auction_fees + model.port_handling + clearing
      + transport + model.commission;

    setMoney("c-fob", fob);
    setMoney("c-freight", freight);
    setMoney("c-insurance", insurance);
    setMoney("c-auction", model.auction_fees);
    setMoney("c-duty", duty);
    setMoney("c-surtax", surtax);
    setMoney("c-vat", vat);
    setMoney("c-port", model.port_handling);
    setMoney("c-clearing", clearing);
    setMoney("c-transport", transport);
    setMoney("c-commission", model.commission);
    setMoney("c-total", total);

    const routeLabel = $("c-route");
    if (routeLabel) routeLabel.textContent = `Route: ${portName}${usingPort ? " · " + port.eta : ""}`;

    recalcInstallment(total);
  };

  /* Installment / lay-by estimator — how Zimbabweans actually pay */
  const recalcInstallment = (total) => {
    const deposit = parseFloat($("finDeposit")?.value) || 0;
    const months = parseFloat($("finMonths")?.value) || 12;
    const annual = parseFloat($("finRate")?.value) || 10;
    const principal = Math.max(total - deposit, 0);
    const r = annual / 100 / 12;
    let monthly = 0;
    if (principal <= 0) monthly = 0;
    else if (r === 0) monthly = principal / months;
    else monthly = (principal * r) / (1 - Math.pow(1 + r, -months));

    setMoney("finPrincipal", principal);
    setMoney("finMonthly", monthly);
    setMoney("finTotalPay", monthly * months);
    const note = $("finNote");
    if (note) {
      note.textContent = `Based on a ${fmtMoney(deposit)} deposit, ${months} months at ${annual}% p.a. — illustrative; our team confirms exact terms.`;
    }
  };

  fobInput.addEventListener("input", recalc);
  freightInput.addEventListener("input", recalc);
  if (portSel) portSel.addEventListener("change", () => {
    if (freightInput) freightInput.disabled = !!portSel.value;
    recalc();
  });
  ["finDeposit", "finMonths", "finRate"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", () => recalc());
  });

  // Default the port to the saved choice
  if (portSel) {
    portSel.value = model.default_port || "beira";
    if (freightInput) freightInput.disabled = true;
  }
  recalc();
});

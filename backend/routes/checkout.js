import crypto from "node:crypto";
import { Router } from "express";

const router = Router();

router.post("/", (request, response) => {
  const recommendation = request.body?.recommendation;

  if (!recommendation?.restaurant || !Array.isArray(recommendation?.items)) {
    response.status(400).json({
      error: "A recommendation with restaurant and items is required."
    });
    return;
  }

  const selectedAddOns = Array.isArray(request.body?.selectedAddOns)
    ? request.body.selectedAddOns
    : [];

  const subtotal = [...recommendation.items, ...selectedAddOns].reduce(
    (sum, item) => sum + Number(item.price || 0),
    0
  );
  const deliveryFee = 2.99;
  const serviceFee = Number((subtotal * 0.08).toFixed(2));
  const total = Number((subtotal + deliveryFee + serviceFee).toFixed(2));
  const checkoutId = crypto.randomUUID();

  response.status(201).json({
    checkoutId,
    status: "mock_checkout_created",
    restaurant: recommendation.restaurant,
    items: recommendation.items,
    selectedAddOns,
    subtotal: Number(subtotal.toFixed(2)),
    deliveryFee,
    serviceFee,
    total,
    estimatedArrivalMinutes: recommendation.deliveryEtaMinutes || 25,
    checkoutUrl: `https://checkout.couchmunch.demo/orders/${checkoutId}`
  });
});

export default router;

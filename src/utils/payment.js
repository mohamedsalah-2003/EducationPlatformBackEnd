import Stripe from "stripe"

const getStripeClient = () => {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error("Missing STRIPE_SECRET_KEY configuration")
    }
    return new Stripe(process.env.STRIPE_SECRET_KEY)
}

export const paymentFunction = async({
    mode='payment',
    customer_email="",
    metadata={},
    success_url,
    cancel_url,
    line_items=[],
    idempotencyKey,
 })=>{
    const stripe = getStripeClient()
    const paymentdata  = await stripe.checkout.sessions.create({
        mode,//required
        customer_email,//optional
        metadata,//optional
        success_url,//required
        cancel_url,//required
        line_items
    }, idempotencyKey ? { idempotencyKey } : undefined)
    return paymentdata
}

export const constructStripeWebhookEvent = ({
    payload,
    signature,
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
}) => {
    if (!webhookSecret) {
        throw new Error("Missing STRIPE_WEBHOOK_SECRET configuration")
    }

    return getStripeClient().webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
    )
}

export const retrieveCheckoutSession = async (sessionId) =>
    getStripeClient().checkout.sessions.retrieve(sessionId)

export const expireCheckoutSession = async (sessionId) =>
    getStripeClient().checkout.sessions.expire(sessionId)


/* 
     line_items:[{
            price_data:{
                currrency,
                product_data:{
                    name,
                },
                unit_amount,
            },
            quantity
        }],//required
    
 */

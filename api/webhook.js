const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

function raw(req) {
  return new Promise((ok, ko) => {
    const c = [];
    req.on('data', d => c.push(d));
    req.on('end', () => ok(Buffer.concat(c)));
    req.on('error', ko);
  });
}

module.exports = async (req, res) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let ev;
  try {
    ev = stripe.webhooks.constructEvent(
      await raw(req),
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    return res.status(400).send('Signature invalide');
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    if (ev.type === 'checkout.session.completed') {
      const s = ev.data.object;
      if (s.client_reference_id && s.payment_status === 'paid') {
        await sb.from('abonnements').upsert({
          user_id: s.client_reference_id,
          stripe_customer_id: s.customer || null,
          plan: (s.metadata && s.metadata.plan) || null,
          statut: 'actif',
          mis_a_jour: new Date().toISOString()
        }, { onConflict: 'user_id' });
      }
    }
    if (ev.type === 'customer.subscription.deleted') {
      await sb.from('abonnements')
        .update({ statut: 'inactif', mis_a_jour: new Date().toISOString() })
        .eq('stripe_customer_id', ev.data.object.customer);
    }
  } catch (e) {
    console.error(e);
    return res.status(500).send('Erreur');
  }
  res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };

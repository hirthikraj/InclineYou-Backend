-- Undo of a sale that turned a prospect into a client (11 Nov 2026).
--
-- Selling a prospect a pack makes them an active client (PackageSaleService). Undo (DELETE /v1/packages/{id}, within
-- ten minutes) took the sale back but left them active, because nothing recorded that THIS sale was what activated
-- them — and guessing from "they have no other pack" would demote a real client who had simply never bought one.
-- So the sale says so: true on the one package whose sale moved its client from prospect to active. Undo puts the
-- client back to prospect only then. Additive: every existing row is false, which is what each one already was.

ALTER TABLE package ADD COLUMN activated_client boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN package.activated_client IS
    'True on the sale that moved its client from prospect to active (11 Nov 2026), so an Undo of that sale can move them back.';

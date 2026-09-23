-- Add poshan_consented for split Eligible / Consented Poshan Potli fields
IF COL_LENGTH('dbo.tb_mukt_entries', 'poshan_consented') IS NULL
BEGIN
  ALTER TABLE dbo.tb_mukt_entries
    ADD poshan_consented INT NOT NULL
      CONSTRAINT DF_tb_mukt_posh_c DEFAULT (0);

  -- Backfill: older combined "eligible/consented" value treated as both eligible and consented
  UPDATE dbo.tb_mukt_entries
  SET poshan_consented = poshan_eligible
  WHERE poshan_consented = 0 AND poshan_eligible > 0;
END
GO

IF OBJECT_ID('dbo.tb_mukt_entry_settings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_entry_settings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    reporting_months_back TINYINT NOT NULL CONSTRAINT DF_tb_settings_months DEFAULT (6),
    submit_deadline_day TINYINT NOT NULL CONSTRAINT DF_tb_settings_submit DEFAULT (10),
    edit_deadline_day TINYINT NOT NULL CONSTRAINT DF_tb_settings_edit DEFAULT (15),
    updated_by INT NULL,
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_tb_settings_updated DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_tb_settings_months CHECK (reporting_months_back BETWEEN 1 AND 24),
    CONSTRAINT CK_tb_settings_submit CHECK (submit_deadline_day BETWEEN 1 AND 28),
    CONSTRAINT CK_tb_settings_edit CHECK (edit_deadline_day BETWEEN 1 AND 28)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.tb_mukt_entry_settings)
BEGIN
  INSERT INTO dbo.tb_mukt_entry_settings (reporting_months_back, submit_deadline_day, edit_deadline_day)
  VALUES (6, 10, 15);
END
GO
-- TB Mukt UP application tables (do NOT alter existing Facility masters)
-- Run via: npm run init-db

IF OBJECT_ID('dbo.tb_mukt_users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    full_name NVARCHAR(150) NOT NULL,
    mobile NVARCHAR(15) NOT NULL,
    email NVARCHAR(150) NOT NULL,
    username NVARCHAR(80) NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    designation NVARCHAR(120) NULL,
    role NVARCHAR(30) NOT NULL,
    state_id INT NULL,
    division_id INT NULL,
    district_id INT NULL,
    tehsil_id INT NULL,
    block_id INT NULL,
    gp_id INT NULL,
    village_id INT NULL,
    is_active BIT NOT NULL CONSTRAINT DF_tb_mukt_users_active DEFAULT (1),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_tb_mukt_users_created DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_tb_mukt_users_updated DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_tb_mukt_users_username UNIQUE (username),
    CONSTRAINT UQ_tb_mukt_users_mobile UNIQUE (mobile),
    CONSTRAINT UQ_tb_mukt_users_email UNIQUE (email)
  );
  CREATE INDEX IX_tb_mukt_users_geo ON dbo.tb_mukt_users(role, state_id, district_id, block_id, gp_id);
END
GO

IF OBJECT_ID('dbo.tb_mukt_password_resets', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_password_resets (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash NVARCHAR(255) NOT NULL,
    expires_at DATETIME2 NOT NULL,
    used BIT NOT NULL CONSTRAINT DF_tb_mukt_pw_used DEFAULT (0),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_tb_mukt_pw_created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_tb_mukt_pw_user FOREIGN KEY (user_id) REFERENCES dbo.tb_mukt_users(id)
  );
END
GO

IF OBJECT_ID('dbo.tb_mukt_entries', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_entries (
    id INT IDENTITY(1,1) PRIMARY KEY,
    state_id INT NULL,
    division_id INT NULL,
    district_id INT NOT NULL,
    district_code NVARCHAR(50) NULL,
    district_name NVARCHAR(150) NULL,
    tehsil_id INT NULL,
    block_id INT NOT NULL,
    block_code NVARCHAR(50) NULL,
    block_name NVARCHAR(150) NULL,
    gp_id INT NOT NULL,
    gp_code NVARCHAR(50) NULL,
    gp_name NVARCHAR(150) NULL,
    gp_population INT NOT NULL CONSTRAINT DF_tb_mukt_gp_pop DEFAULT (0),
    village_id INT NULL,
    village_code NVARCHAR(50) NULL,
    village_name NVARCHAR(150) NULL,
    village_population INT NULL,
    tb_unit_id INT NULL,
    tb_unit_name NVARCHAR(150) NULL,
    reporting_month TINYINT NOT NULL,
    reporting_year SMALLINT NOT NULL,
    tested_naat INT NOT NULL CONSTRAINT DF_tb_mukt_tested DEFAULT (0),
    tb_diagnosed INT NOT NULL CONSTRAINT DF_tb_mukt_diag DEFAULT (0),
    prev_year_success_treatment INT NOT NULL CONSTRAINT DF_tb_mukt_tx DEFAULT (0),
    treatment_success_pct DECIMAL(6,2) NULL,
    poshan_eligible INT NOT NULL CONSTRAINT DF_tb_mukt_posh_e DEFAULT (0),
    poshan_consented INT NOT NULL CONSTRAINT DF_tb_mukt_posh_c DEFAULT (0),
    poshan_received INT NOT NULL CONSTRAINT DF_tb_mukt_posh_r DEFAULT (0),
    testing_rate DECIMAL(12,4) NULL,
    detection_rate DECIMAL(12,4) NULL,
    poshan_pct DECIMAL(8,2) NULL,
    indicator1 BIT NULL,
    indicator2 BIT NULL,
    indicator3 BIT NULL,
    indicator4 BIT NULL,
    is_qualified BIT NULL,
    overall_target DECIMAL(12,2) NULL,
    testing_pending DECIMAL(12,2) NULL,
    poshan_pending DECIMAL(12,2) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_tb_mukt_entry_status DEFAULT ('DRAFT'),
    created_by INT NULL,
    updated_by INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_tb_mukt_entry_created DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_tb_mukt_entry_updated DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_tb_mukt_entry_gp_period UNIQUE (gp_id, reporting_month, reporting_year),
    CONSTRAINT CK_tb_mukt_entry_month CHECK (reporting_month BETWEEN 1 AND 12),
    CONSTRAINT CK_tb_mukt_entry_status CHECK (status IN ('DRAFT', 'SUBMITTED'))
  );
  CREATE INDEX IX_tb_mukt_entries_district ON dbo.tb_mukt_entries(district_id, reporting_year, reporting_month);
  CREATE INDEX IX_tb_mukt_entries_block ON dbo.tb_mukt_entries(block_id, reporting_year, reporting_month);
  CREATE INDEX IX_tb_mukt_entries_qualified ON dbo.tb_mukt_entries(is_qualified, reporting_year);
END
GO

IF OBJECT_ID('dbo.tb_mukt_qualification_history', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_qualification_history (
    id INT IDENTITY(1,1) PRIMARY KEY,
    gp_id INT NOT NULL,
    gp_name NVARCHAR(150) NULL,
    district_id INT NULL,
    block_id INT NULL,
    year SMALLINT NOT NULL,
    qualified BIT NOT NULL,
    medal NVARCHAR(20) NOT NULL CONSTRAINT DF_tb_mukt_medal DEFAULT ('NONE'),
    previous_year_status NVARCHAR(20) NULL,
    consecutive_years INT NOT NULL CONSTRAINT DF_tb_mukt_consec DEFAULT (0),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_tb_mukt_qh_created DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_tb_mukt_qh_updated DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_tb_mukt_qh_gp_year UNIQUE (gp_id, year),
    CONSTRAINT CK_tb_mukt_medal CHECK (medal IN ('NONE', 'BRONZE', 'SILVER', 'GOLD', 'NOT_QUALIFIED'))
  );
  CREATE INDEX IX_tb_mukt_qh_medal ON dbo.tb_mukt_qualification_history(year, medal);
END
GO

-- Fallback location masters (used only if Facility DB has no matching tables)
IF OBJECT_ID('dbo.tb_mukt_state', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_state (
    id INT IDENTITY(1,1) PRIMARY KEY,
    code NVARCHAR(20) NULL,
    name NVARCHAR(150) NOT NULL,
    is_active BIT NOT NULL DEFAULT (1)
  );
END
GO

IF OBJECT_ID('dbo.tb_mukt_division', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_division (
    id INT IDENTITY(1,1) PRIMARY KEY,
    state_id INT NOT NULL,
    code NVARCHAR(20) NULL,
    name NVARCHAR(150) NOT NULL,
    is_active BIT NOT NULL DEFAULT (1),
    CONSTRAINT FK_tb_mukt_div_state FOREIGN KEY (state_id) REFERENCES dbo.tb_mukt_state(id)
  );
  CREATE INDEX IX_tb_mukt_division_state ON dbo.tb_mukt_division(state_id);
END
GO

IF OBJECT_ID('dbo.tb_mukt_district', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_district (
    id INT IDENTITY(1,1) PRIMARY KEY,
    division_id INT NOT NULL,
    state_id INT NOT NULL,
    code NVARCHAR(20) NULL,
    name NVARCHAR(150) NOT NULL,
    is_active BIT NOT NULL DEFAULT (1),
    CONSTRAINT FK_tb_mukt_dist_div FOREIGN KEY (division_id) REFERENCES dbo.tb_mukt_division(id)
  );
  CREATE INDEX IX_tb_mukt_district_div ON dbo.tb_mukt_district(division_id);
END
GO

IF OBJECT_ID('dbo.tb_mukt_tehsil', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_tehsil (
    id INT IDENTITY(1,1) PRIMARY KEY,
    district_id INT NOT NULL,
    code NVARCHAR(20) NULL,
    name NVARCHAR(150) NOT NULL,
    is_active BIT NOT NULL DEFAULT (1),
    CONSTRAINT FK_tb_mukt_teh_dist FOREIGN KEY (district_id) REFERENCES dbo.tb_mukt_district(id)
  );
  CREATE INDEX IX_tb_mukt_tehsil_dist ON dbo.tb_mukt_tehsil(district_id);
END
GO

IF OBJECT_ID('dbo.tb_mukt_block', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_block (
    id INT IDENTITY(1,1) PRIMARY KEY,
    tehsil_id INT NOT NULL,
    district_id INT NOT NULL,
    code NVARCHAR(20) NULL,
    name NVARCHAR(150) NOT NULL,
    is_active BIT NOT NULL DEFAULT (1),
    CONSTRAINT FK_tb_mukt_block_teh FOREIGN KEY (tehsil_id) REFERENCES dbo.tb_mukt_tehsil(id)
  );
  CREATE INDEX IX_tb_mukt_block_teh ON dbo.tb_mukt_block(tehsil_id);
END
GO

IF OBJECT_ID('dbo.tb_mukt_gp', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_gp (
    id INT IDENTITY(1,1) PRIMARY KEY,
    block_id INT NOT NULL,
    code NVARCHAR(20) NULL,
    name NVARCHAR(150) NOT NULL,
    population INT NOT NULL DEFAULT (0),
    is_active BIT NOT NULL DEFAULT (1),
    CONSTRAINT FK_tb_mukt_gp_block FOREIGN KEY (block_id) REFERENCES dbo.tb_mukt_block(id)
  );
  CREATE INDEX IX_tb_mukt_gp_block ON dbo.tb_mukt_gp(block_id);
END
GO

IF OBJECT_ID('dbo.tb_mukt_village', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_village (
    id INT IDENTITY(1,1) PRIMARY KEY,
    gp_id INT NOT NULL,
    code NVARCHAR(20) NULL,
    name NVARCHAR(150) NOT NULL,
    population INT NOT NULL DEFAULT (0),
    is_active BIT NOT NULL DEFAULT (1),
    CONSTRAINT FK_tb_mukt_vil_gp FOREIGN KEY (gp_id) REFERENCES dbo.tb_mukt_gp(id)
  );
  CREATE INDEX IX_tb_mukt_village_gp ON dbo.tb_mukt_village(gp_id);
END
GO

IF OBJECT_ID('dbo.tb_mukt_tb_unit', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_tb_unit (
    id INT IDENTITY(1,1) PRIMARY KEY,
    gp_id INT NOT NULL,
    code NVARCHAR(20) NULL,
    name NVARCHAR(150) NOT NULL,
    unit_type NVARCHAR(50) NULL,
    is_active BIT NOT NULL DEFAULT (1),
    CONSTRAINT FK_tb_mukt_tbu_gp FOREIGN KEY (gp_id) REFERENCES dbo.tb_mukt_gp(id)
  );
  CREATE INDEX IX_tb_mukt_tbu_gp ON dbo.tb_mukt_tb_unit(gp_id);
END
GO

IF OBJECT_ID('dbo.tb_mukt_location_map', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tb_mukt_location_map (
    id INT IDENTITY(1,1) PRIMARY KEY,
    level_name NVARCHAR(40) NOT NULL,
    source_mode NVARCHAR(20) NOT NULL, -- EXISTING | FALLBACK
    table_schema NVARCHAR(50) NOT NULL,
    table_name NVARCHAR(128) NOT NULL,
    id_column NVARCHAR(128) NOT NULL,
    name_column NVARCHAR(128) NOT NULL,
    code_column NVARCHAR(128) NULL,
    parent_column NVARCHAR(128) NULL,
    population_column NVARCHAR(128) NULL,
    extra_json NVARCHAR(MAX) NULL,
    updated_at DATETIME2 NOT NULL DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_tb_mukt_locmap_level UNIQUE (level_name)
  );
END
GO

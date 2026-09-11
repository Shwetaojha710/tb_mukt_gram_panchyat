import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TbEntrySettingsComponent } from './tb-entry-settings.component';

describe('TbEntrySettingsComponent', () => {
  let component: TbEntrySettingsComponent;
  let fixture: ComponentFixture<TbEntrySettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TbEntrySettingsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TbEntrySettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

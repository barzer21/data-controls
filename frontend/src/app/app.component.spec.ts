import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app.component';

@Component({ template: '' })
class PageStub {}

describe('Application navigation', () => {
  it('links to AI creation from the rail, preserves the list page and marks only one section active', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: 'rules', component: PageStub },
          { path: 'rules/ai/new', component: PageStub },
          { path: 'rules/new', component: PageStub },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await router.navigateByUrl('/rules?page=3');
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.app-rail .ai-create') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/rules/ai/new?page=3');
    expect(link.textContent).toContain('יצירת בקרה בעזרת AI');
    link.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/rules/ai/new?page=3');
    expect(link.classList.contains('active')).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('nav a.active').length).toBe(1);
    const manual = fixture.nativeElement.querySelector('.manual-create') as HTMLAnchorElement;
    expect(manual.getAttribute('href')).toBe('/rules/new?page=3');
    manual.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/rules/new?page=3');
    expect(manual.classList.contains('active')).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('nav a.active').length).toBe(1);
  });
});

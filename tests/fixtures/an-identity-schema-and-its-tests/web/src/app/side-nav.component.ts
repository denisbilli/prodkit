import { Component } from '@angular/core';
import { ReplaySubject } from 'rxjs';

@Component({ selector: 'app-side-nav', template: '' })
export class SideNavComponent {
  private loadDataSubject = new ReplaySubject<void>();
  loadData$ = this.loadDataSubject.asObservable();

  refresh() {
    this.loadDataSubject.next();
  }
}
